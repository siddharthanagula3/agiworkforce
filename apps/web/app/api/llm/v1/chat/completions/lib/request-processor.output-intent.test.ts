import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyTaskLocally } from '@agiworkforce/routing';
import {
  GENERATE_IMAGE_TOOL_NAME,
  EDIT_IMAGE_TOOL_NAME,
  IMAGE_CARD_KIND,
  getRoutingSlotModel,
} from '@agiworkforce/types';

const imageOffer = vi.hoisted(() => vi.fn());
type OriginalImageChatToolsModule = typeof import('@/app/api/media/image/lib/image-chat-tools');

vi.mock('@/app/api/media/image/lib/image-chat-tools', async (importOriginal) => ({
  ...(await importOriginal<OriginalImageChatToolsModule>()),
  imageChatToolOffer: imageOffer,
}));

import {
  resolveWebSearchRequirement,
  shouldOfferWebSearchForTurn,
} from '@/lib/web-search/required-search';

import {
  ChatCompletionRequestSchema,
  applyImplicitManagedToolIntent,
  imageToolsForTurn,
} from './request-processor';

describe('chat request output intent through tool selection', () => {
  beforeEach(() => {
    imageOffer.mockReturnValue({ edit: true, aspectRatios: ['1:1'] });
  });

  it.each([false, true])(
    'scopes long supplied-material lookup signals to the actual request (explicit lookup %s)',
    (explicitLookup) => {
      const prompt =
        'Write a concise summary of the supplied archived notes.\n\n' +
        'Archived material without a lookup instruction. '.repeat(70) +
        '\n\nAn old example says: search the web for current weather and product details.\n\n' +
        'More supplied archived material. '.repeat(70) +
        (explicitLookup
          ? '\n\nCheck the web for supporting facts before summarizing.'
          : '\n\nKeep the summary to three sentences.');
      const task = classifyTaskLocally(prompt, []).type;
      const requirement = resolveWebSearchRequirement({
        webSearchEnabled: true,
        agiWorkRun: false,
        researchTask: task === 'research',
        userMessage: prompt,
      });
      expect(requirement.required).toBe(explicitLookup);
      expect(
        shouldOfferWebSearchForTurn({
          webSearchEnabled: true,
          requirement,
          modelPolicy: undefined,
          surface: 'web',
          userMessage: prompt,
        }),
      ).toBe(explicitLookup);
      if (!explicitLookup) expect(task).not.toBe('research');
    },
  );

  it.each([
    'Write a professional email to a fictional project team about a product launch.',
    'Create separate editable writing artifacts for seven different reusable prompts.',
    'Create five independently copyable blocks: a prompt, commands, a query, a request, and a configuration.',
    'Render a functional interactive project configuration form with web-search and code-generation checkboxes.',
    'Render summary cards, a feature grid, a carousel and an expandable details section.',
    'Visually render a flowchart, a sequence diagram and a timeline.',
    'Render a chart using these numbers: 3, 5, 8.',
    'Render an equation with proper mathematical typesetting.',
    'Render a complete UI gallery demonstrating the current chat components.',
    'What is 19 * 27?',
  ])('selects no image or search tools for %s', (prompt) => {
    const request = ChatCompletionRequestSchema.parse({
      model: getRoutingSlotModel('general_balanced'),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      web_search: true,
      x_interactive_cards: { supported: [IMAGE_CARD_KIND], canRespond: true },
    });
    const taskType = classifyTaskLocally(prompt, []).type;
    applyImplicitManagedToolIntent(request, { prompt, taskType, planTier: 'pro' });
    const requirement = resolveWebSearchRequirement({
      webSearchEnabled: request.web_search,
      agiWorkRun: false,
      researchTask: taskType === 'research',
      userMessage: prompt,
    });
    expect(
      imageToolsForTurn(request, {
        surface: 'web',
        toolsCapable: true,
        planTier: 'pro',
        userMessage: prompt,
      }),
    ).toEqual([]);
    expect(imageOffer).not.toHaveBeenCalled();
    expect(
      shouldOfferWebSearchForTurn({
        webSearchEnabled: request.web_search,
        requirement,
        modelPolicy: undefined,
        surface: 'web',
        userMessage: prompt,
      }),
    ).toBe(false);
  });

  it.each([
    'Generate a photo of a fox in the snow.',
    'Generate or retrieve four distinct images representing an AI chat interface, analytics dashboard, mobile application, and developer workspace. Render them inline as a responsive image gallery with captions.',
  ])('still offers image generation when the output is explicitly images: %s', (prompt) => {
    const request = ChatCompletionRequestSchema.parse({
      model: getRoutingSlotModel('general_balanced'),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      x_interactive_cards: { supported: [IMAGE_CARD_KIND], canRespond: true },
    });
    const tools = imageToolsForTurn(request, {
      surface: 'web',
      toolsCapable: true,
      planTier: 'pro',
      userMessage: prompt,
    });
    expect(tools.some((tool) => tool.function.name === GENERATE_IMAGE_TOOL_NAME)).toBe(true);
    expect(imageOffer).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Please craft a concise formal notification of leave.',
    'Could you arrange the supplied content into a polished comparison?',
  ])(
    'offers no image tools for unknown functional phrasing even with an available image: %s',
    (prompt) => {
      const request = ChatCompletionRequestSchema.parse({
        model: getRoutingSlotModel('general_balanced'),
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        x_interactive_cards: { supported: [IMAGE_CARD_KIND], canRespond: true },
      });
      expect(
        imageToolsForTurn(request, {
          surface: 'web',
          toolsCapable: true,
          planTier: 'pro',
          userMessage: prompt,
          hasSourceImage: true,
        }),
      ).toEqual([]);
      expect(imageOffer).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['another one', [GENERATE_IMAGE_TOOL_NAME, EDIT_IMAGE_TOOL_NAME]],
    ['Make it warmer.', [EDIT_IMAGE_TOOL_NAME]],
  ] as const)('offers %s only with verified source context', (prompt, expectedNames) => {
    const request = ChatCompletionRequestSchema.parse({
      model: getRoutingSlotModel('general_balanced'),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      x_interactive_cards: { supported: [IMAGE_CARD_KIND], canRespond: true },
    });
    const params = {
      surface: 'web' as const,
      toolsCapable: true,
      planTier: 'pro',
      userMessage: prompt,
    };
    expect(imageToolsForTurn(request, { ...params, hasSourceImage: false })).toEqual([]);
    expect(
      imageToolsForTurn(request, { ...params, hasSourceImage: true }).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(expectedNames);
  });
});
