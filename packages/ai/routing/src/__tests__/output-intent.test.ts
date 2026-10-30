import { describe, expect, it } from 'vitest';

import {
  classifyResponseOutputIntent,
  classifyImageToolIntent,
  imageToolIntentAllows,
  requestsSeparateImageResources,
  isSelfContainedResponseRequest,
  requestsNonImageOutput,
} from '../output-intent';

const NON_IMAGE_REQUESTS = [
  'Write an email asking my assistant to take leave tomorrow.',
  'Prepare seven independent reusable prompts, each in its own copyable block.',
  'Create a document with a story about a robot learning to paint.',
  'Write an image-generation prompt about a moonlit forest.',
  'Show a complete intelligent UI gallery inline in this chat.',
  'Render a form with select fields and a submit button.',
  'Create cards and a carousel with supplied captions.',
  'Draw a sequence diagram for token refresh.',
  'Visualize the supplied data in a line chart.',
  'Render a copyable shell snippet that prints a greeting.',
  'Typeset an equation and show a worked example.',
  'Calculate 19 * 27.',
  'What is 19 * 27?',
  'Create an SVG illustration of a tree.',
  'Use Mermaid to show the request flow.',
  'I need a diagram of the approval flow.',
  'What can you actually render in this chat? Show me one example.',
  'AGIWORKFORCE: RENDER A COMPLETE UI GALLERY\n\nGenerate one comprehensive, visually rich response that demonstrates the current chat rendering types.',
  'Can you please format this text: the latest update is ready today.',
] as const;

const QA_RENDERING_REQUESTS = [
  'Render a Markdown formatting showcase containing H1, H2, H3, bold, italic, underline, strikethrough, nested numbered and bullet lists, a blockquote, horizontal divider, inline code, hyperlink, task checklist, and a five-row table. Render everything visually rather than explaining Markdown syntax.',
  'Write a professional email to a fictional project team about a product launch. Use a dedicated editable email writing block with subject, greeting, body paragraphs, bullet points, and sign-off. Render the actual email artifact with copy and edit controls, not an ordinary Markdown response.',
  'Create separate editable writing artifacts for a Slack message, social media post, project report, meeting summary, reusable AI prompt, business proposal, and product requirements document. Each artifact should have independent copy and editing controls where supported.',
  'Generate separate, valid code examples in Python, JavaScript, TypeScript, HTML, CSS, SQL, JSON, YAML, Bash, and a unified diff. Render each in its own language-aware code block with syntax highlighting and appropriate copy, edit, expand, preview, or run controls where supported.',
  'Create a small interactive HTML or React calculator with two number inputs, Add and Multiply buttons, and a result display. Show the source code and a working visual preview if the application supports code previews.',
  'Create five independently copyable blocks: an AI agent prompt, Bash commands, a SQL query, a JSON API request, and a YAML configuration. Each block should have a separate copy action.',
  'Render a functional interactive project configuration form containing a project-name input, fictional model dropdown, response-style radio group, web-search checkbox, code-generation checkbox, monthly budget slider, target-date picker, and Apply button. Applying should display the selected values in a result panel.',
  'Render two summary cards, a three-column feature grid, three fictional product recommendation cards, a responsive comparison layout, a navigable carousel, and an expandable details section. Use actual visual components rather than Markdown tables.',
  'Using monthly values January 120, February 190, March 155, April 280, May 310, June 260, render a native bar chart, line chart, and data table. Also render a pie chart using Research 25, Coding 35, Writing 20, and Analysis 20. Include correct labels and interactive tooltips where supported.',
  'Visually render three diagrams: an AI request flowchart from User to Model to Parser to Renderer, a sequence diagram between User, Frontend, Backend, and AI Provider, and a software deployment timeline. Use an actual diagram renderer rather than ASCII text.',
  "Render Einstein's equation, the quadratic formula, Bayes' theorem, a matrix, a definite integral, and a summation using proper mathematical typesetting. Include inline and block-level equations.",
] as const;

describe('response output intent', () => {
  it.each([...NON_IMAGE_REQUESTS, ...QA_RENDERING_REQUESTS])(
    'keeps %s out of image generation and external search',
    (message) => {
      expect(requestsNonImageOutput(message)).toBe(true);
      expect(isSelfContainedResponseRequest(message)).toBe(true);
    },
  );

  it.each([
    '/image a sunset over mountains',
    'Please generate an image of a cat',
    'Create a picture of a beach',
    'make a logo for my brand',
    'draw me a cartoon cat',
    'create a detailed anime portrait',
    'Paint a forest at sunrise',
    'Generate an image of a flowchart drawn on a whiteboard',
    "I'd like an illustration of a mountain cabin.",
    'Create a collage of four autumn photographs.',
    'Generate or retrieve four distinct images representing an AI chat interface, analytics dashboard, mobile application, and developer workspace. Render them inline as a responsive image gallery with captions.',
  ])('preserves explicit picture intent: %s', (message) => {
    expect(classifyResponseOutputIntent(message)).toBe('image');
    expect(requestsNonImageOutput(message)).toBe(false);
  });

  it.each([
    'Write an email about the latest news in the election.',
    'Create a chart of current stock prices.',
    'Draft a research report with citations.',
    'Render a chart, search the web for the current exchange rate.',
  ])('keeps external facts separate from the output medium: %s', (message) => {
    expect(isSelfContainedResponseRequest(message)).toBe(false);
    expect(requestsNonImageOutput(message)).toBe(true);
  });

  it('does not treat quoted instructions as an image request', () => {
    expect(classifyResponseOutputIntent('Rewrite this prompt: "generate an image of a tree"')).toBe(
      'text',
    );
  });

  it('reads the user request after fenced material without classifying its instructions', () => {
    expect(
      classifyResponseOutputIntent(
        '```text\nGenerate an image of a tree\n```\nWrite an email about this prompt.',
      ),
    ).toBe('text');
    expect(
      classifyResponseOutputIntent(
        'Rewrite the following:\n````text\n```\ngenerate an image\n```\n````',
      ),
    ).toBe('text');
  });
});

describe('image tool admission', () => {
  it.each([
    'Generate four distinct images representing a chat interface, dashboard, mobile application and developer workspace.',
    'Create two photographs of mountains.',
    'Make multiple variations of a portrait.',
    'Create 12 icon images for a fictional app.',
  ])('keeps separate image resources in conversational orchestration: %s', (message) => {
    expect(requestsSeparateImageResources(message)).toBe(true);
    expect(classifyImageToolIntent(message)).toBe('generate');
  });

  it.each([
    'Create one collage of four images.',
    'Generate a single collage containing 4 pictures.',
    'Create one image of two cats.',
    'Write four image-generation prompts.',
  ])(
    'keeps a single composition or text request distinct from multiple resources: %s',
    (message) => {
      expect(requestsSeparateImageResources(message)).toBe(false);
    },
  );
  it.each([
    'Please craft a concise formal notification of leave.',
    'Could you arrange the supplied content into a polished comparison?',
    'I need an outline for weekly planning.',
  ])('does not infer image permission from unknown output or available images: %s', (message) => {
    const intent = classifyImageToolIntent(message);
    expect(intent).toBeNull();
    for (const hasSource of [false, true]) {
      expect(imageToolIntentAllows(intent, 'generate', hasSource)).toBe(false);
      expect(imageToolIntentAllows(intent, 'edit', hasSource)).toBe(false);
    }
  });

  it('requires actual source context for an image edit', () => {
    const intent = classifyImageToolIntent('Make it warmer.');
    expect(intent).toBe('edit');
    expect(imageToolIntentAllows(intent, 'generate', true)).toBe(false);
    expect(imageToolIntentAllows(intent, 'edit', false)).toBe(false);
    expect(imageToolIntentAllows(intent, 'edit', true)).toBe(true);
  });

  it('requires actual source context for shorthand continuation', () => {
    const intent = classifyImageToolIntent('another one');
    expect(intent).toBe('continuation');
    expect(imageToolIntentAllows(intent, 'generate', false)).toBe(false);
    expect(imageToolIntentAllows(intent, 'generate', true)).toBe(true);
  });
});
