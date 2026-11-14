import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  ANSWER_UI_CARD_KIND,
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  type AnswerUiBlock,
  type AnswerUiCardBody,
  type InteractiveCard,
} from '@agiworkforce/types';
import {
  answerUiFallbackText,
  answerUiToolDefinition,
  executeAnswerUiTool,
  normalizeAnswerUiInput,
} from './answer-ui-tool-service';

const NOW = () => new Date('2026-10-25T10:00:00.000Z');

function bodyOf(card: InteractiveCard): AnswerUiCardBody {
  if (!card.recognized || card.kind !== ANSWER_UI_CARD_KIND)
    throw new Error('not an answer UI card');
  return card.body;
}

function render(args: Record<string, unknown>) {
  const outcome = executeAnswerUiTool(args, { toolCallId: 'toolu_1', now: NOW });
  if (!outcome.ok) throw new Error(outcome.content);
  return { outcome, body: bodyOf(outcome.card) };
}

function blockOf<T extends AnswerUiBlock['type']>(
  body: AnswerUiCardBody,
  type: T,
): Extract<AnswerUiBlock, { type: T }> {
  const found: AnswerUiBlock[] = [];
  const walk = (blocks: AnswerUiBlock[]) => {
    for (const block of blocks) {
      found.push(block);
      if ('blocks' in block) walk(block.blocks);
    }
  };
  walk(body.blocks);
  const match = found.find((block) => block.type === type);
  if (!match) throw new Error(`no ${type} block`);
  return match as Extract<AnswerUiBlock, { type: T }>;
}

describe('render_answer_ui tool definition', () => {
  it('is the same object on every call, so the cached tool list never changes', () => {
    expect(JSON.stringify(answerUiToolDefinition())).toBe(JSON.stringify(answerUiToolDefinition()));
  });

  it('keeps the guidance on when not to use it in the stable description', () => {
    const description = answerUiToolDefinition().function.description;
    expect(description).toMatch(/Do not use it for short factual answers/);
    expect(description).toMatch(/most answers need no UI/);
  });
});

describe('render_answer_ui input repair', () => {
  it('builds a valid card from a loose, small-model style call', () => {
    const { body, outcome } = render({
      title: 'Budget <b>planner</b>',
      blocks: JSON.stringify([
        { kind: 'paragraph', content: 'Set your numbers.' },
        { type: 'range', label: 'Monthly rent', min: '0', max: '4000', default: '1500', unit: '$' },
        { type: 'number', label: 'Income', value: '5,000' },
        { type: 'stat', label: 'Left', formula: '= income - monthly_rent' },
        {
          type: 'bar',
          title: 'Spending',
          labels: ['Rent', 'Food'],
          series: [{ name: 'USD', values: ['=Monthly rent', 400] }],
        },
        { type: 'radio', label: 'Plan', options: ['Free', 'Plus', 'Pro'], selected: 'plus' },
        { type: 'todo', title: 'QA', items: ['Check links', { text: 'Check forms', done: true }] },
        {
          type: 'buttons',
          buttons: [{ label: 'Apply', message: 'Use rent {{monthly_rent}} on the {plan} plan' }],
        },
      ]),
    });

    expect(parseInteractiveCardDelta({ card: outcome.card })?.recognized).toBe(true);
    expect(body.title).toBe('Budget planner');
    const slider = blockOf(body, 'slider');
    expect(slider).toMatchObject({
      id: 'monthly_rent',
      min: 0,
      max: 4000,
      value: 1500,
      unitPosition: 'prefix',
    });
    expect(blockOf(body, 'readout').value).toBe('{= income - monthly_rent}');
    expect(blockOf(body, 'chart').series[0]?.points[0]?.y).toBe('=monthly_rent');
    expect(blockOf(body, 'choice')).toMatchObject({ style: 'radio', selected: ['plus'] });
    expect(blockOf(body, 'checklist').items.map((item) => item.checked)).toEqual([false, true]);
    expect(blockOf(body, 'actions').buttons[0]).toMatchObject({
      action: 'send',
      template: 'Use rent {monthly_rent} on the {plan} plan',
      primary: true,
    });
  });

  it('strips html and unsafe links instead of rejecting the answer', () => {
    const { body } = render({
      blocks: [
        {
          type: 'text',
          text: 'Hi <script>alert(1)</script>[click](javascript:alert(1)) ![x](http://t.test/p.png)',
        },
        {
          type: 'gallery',
          images: [
            { url: 'http://t.test/a.png', alt: 'a' },
            { url: 'https://t.test/b.png', alt: 'b' },
          ],
        },
        {
          type: 'actions',
          buttons: [
            { label: 'Open', action: 'link', url: 'javascript:alert(1)' },
            { label: 'Docs', url: 'https://example.com/docs' },
          ],
        },
      ],
    });
    expect(blockOf(body, 'text').markdown).toBe('Hi click x');
    expect(blockOf(body, 'gallery').images.map((image) => image.url)).toEqual([
      'https://t.test/b.png',
    ]);
    expect(blockOf(body, 'actions').buttons.map((button) => button.label)).toEqual(['Docs']);
  });

  it('removes template slots that name no control rather than failing', () => {
    const { body, outcome } = render({
      blocks: [
        { type: 'slider', id: 'rent', label: 'Rent', min: 0, max: 100 },
        { type: 'readout', label: 'Total', value: 'Rent {rent}, tax {tax}, sum {= rent + tax}' },
      ],
    });
    expect(blockOf(body, 'readout').value).toBe('Rent {rent}, tax , sum');
    expect(outcome.content).toMatch(/Removed template slots/);
  });

  it('drops a doubled currency sign in front of a prefixed slider', () => {
    const { body } = render({
      blocks: [
        { type: 'slider', id: 'rent', label: 'Rent', min: 0, max: 100, unit: '$' },
        { type: 'readout', label: 'Rent', value: 'You pay ${rent}' },
      ],
    });
    expect(blockOf(body, 'readout').value).toBe('You pay {rent}');
  });

  it('turns an action panel, status list, steps and files into their blocks', () => {
    const { body } = render({
      blocks: [
        {
          type: 'action_panel',
          title: 'Review',
          text: 'Two checks failed.',
          buttons: [
            { label: 'Copy note', action: 'copy', message: 'Fix contrast' },
            { label: 'Explain', message: 'Explain the failures' },
          ],
        },
        {
          type: 'status',
          items: [
            { label: 'Contrast', status: 'Failed' },
            { label: 'Links', status: 'Passed' },
            { label: 'Forms', status: 'Not tested' },
          ],
        },
        {
          type: 'timeline',
          items: [
            { title: 'Plan', status: 'Complete' },
            { title: 'Build', status: 'In progress' },
          ],
        },
        {
          type: 'files',
          items: [{ name: 'report.pdf', text: 'Q3 report' }, { name: 'config.json' }],
        },
        { type: 'follow_ups', items: ['Show more code block types', 'Explain diffs'] },
      ],
    });
    const panel = blockOf(body, 'card');
    expect(panel.blocks.map((block) => block.type)).toEqual(['text', 'actions']);
    expect(blockOf(body, 'status').items.map((item) => item.tone)).toEqual([
      'danger',
      'success',
      'neutral',
    ]);
    expect(blockOf(body, 'steps').items.map((item) => item.tone)).toEqual(['success', 'warning']);
    expect(blockOf(body, 'files').items.map((item) => item.fileType)).toEqual(['PDF', 'JSON']);
    expect(blockOf(body, 'suggestions').items.map((item) => item.text)).toEqual([
      'Show more code block types',
      'Explain diffs',
    ]);
  });

  it('flattens columns nested past the depth limit and splits more than four columns', () => {
    const { body } = render({
      blocks: [
        {
          type: 'columns',
          blocks: Array.from({ length: 6 }, (_, index) => ({
            title: `Plan ${index + 1}`,
            blocks: [
              {
                type: 'card',
                title: 'inner',
                blocks: [{ type: 'card', title: 'deep', text: 'x' }],
              },
            ],
          })),
        },
      ],
    });
    expect(body.blocks.map((block) => block.type)).toEqual(['columns', 'columns']);
    const [first] = body.blocks;
    if (first?.type !== 'columns') throw new Error('expected columns');
    expect(first.blocks).toHaveLength(4);
    const card = first.blocks[0];
    if (card?.type !== 'card') throw new Error('expected a card column');
    expect(card.blocks.every((child) => child.type !== 'card' || child.blocks.length === 0)).toBe(
      true,
    );
  });

  it('reports nothing usable as an error so the model answers in text', () => {
    const outcome = executeAnswerUiTool(
      { blocks: [{ type: 'iframe' }, 42] },
      { toolCallId: 't', now: NOW },
    );
    expect(outcome).toEqual({ ok: false, content: expect.stringMatching(/Answer in plain text/) });
  });

  it('leaves out trailing blocks that do not fit one card and says so', () => {
    const outcome = executeAnswerUiTool(
      {
        blocks: Array.from({ length: 12 }, (_, index) => ({
          type: 'text',
          text: `${index} ${'word '.repeat(300)}`,
        })),
      },
      { toolCallId: 'toolu_big', now: NOW },
    );
    if (!outcome.ok) throw new Error(outcome.content);
    expect(JSON.stringify(outcome.card).length).toBeLessThanOrEqual(
      INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
    );
    expect(bodyOf(outcome.card).blocks.length).toBeLessThan(12);
    expect(outcome.content).toMatch(/did not fit and were left out/);
  });
});

describe('render_answer_ui fallback text', () => {
  it('writes a plain-text version with no markdown table pipes', () => {
    const { body, outcome } = render({
      title: 'Plans',
      blocks: [
        {
          type: 'table',
          columns: ['Plan', 'Price'],
          rows: [
            ['Free', '$0'],
            ['Pro', '$20'],
          ],
        },
        { type: 'checklist', items: ['Check links'] },
        { type: 'map', title: 'Cafes', pins: [{ label: 'Blue Bottle', lat: 37.78, lng: -122.41 }] },
      ],
    });
    const text = answerUiFallbackText(body);
    expect(text).not.toContain('|');
    expect(text).toContain('Plan: Free; Price: $0');
    expect(text).toContain('- [ ] Check links');
    expect(text).toContain('https://www.google.com/maps/search/?api=1&query=Blue+Bottle');
    expect(outcome.card.fallback).toEqual({ headline: 'Plans', text });
  });

  it('tells the model what rendered without repeating it', () => {
    const { outcome } = render({
      blocks: [{ type: 'slider', id: 'rent', label: 'Rent', max: 10 }],
    });
    expect(outcome.content).toMatch(/^Rendered the UI below your reply: slider\./);
    expect(outcome.content).toMatch(/do not repeat what the UI shows/);
  });
});

describe('normalizeAnswerUiInput', () => {
  it('accepts a single block passed as the whole argument', () => {
    expect(normalizeAnswerUiInput({ type: 'text', text: 'Hello' }).body?.blocks).toHaveLength(1);
  });
});
