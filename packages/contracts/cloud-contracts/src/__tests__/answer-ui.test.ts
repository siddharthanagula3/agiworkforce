import { describe, expect, it } from 'vitest';
import {
  ANSWER_UI_CARD_KIND,
  ANSWER_UI_LIMITS,
  INTERACTIVE_CARDS_METADATA_KEY,
  answerUiInitialValues,
  composeAnswerUiMessage,
  parseAnswerUiExpression,
  renderAnswerUiTemplate,
  answerUiControls,
  type AnswerUiCardBody,
} from '@agiworkforce/types';
import { AnswerUiCardBodySchema, containsAnswerUiHtml, removeAnswerUiHtml } from '../answer-ui';
import { parseInteractiveCardDelta, readPersistedInteractiveCards } from '../interactive-cards';

const PIN_URL = 'https://www.google.com/maps/search/?api=1&query=Blue+Bottle+Coffee';

function budgetBody(): AnswerUiCardBody {
  return {
    title: 'Monthly budget',
    blocks: [
      { type: 'heading', id: 'intro', text: 'Plan your month', level: 2 },
      { type: 'text', id: 'lead', markdown: 'Move the sliders to see what is **left**.' },
      {
        type: 'slider',
        id: 'income',
        label: 'Income',
        min: 0,
        max: 10_000,
        step: 100,
        value: 5_000,
        unit: '$',
        unitPosition: 'prefix',
      },
      {
        type: 'slider',
        id: 'rent',
        label: 'Rent',
        min: 0,
        max: 5_000,
        step: 50,
        value: 1_800,
        unit: '$',
        unitPosition: 'prefix',
        readout: 'Rent is {rent}',
      },
      {
        type: 'choice',
        id: 'plan',
        label: 'Plan',
        style: 'radio',
        options: [
          { id: 'free', label: 'Free' },
          { id: 'pro', label: 'Pro', description: 'For teams' },
        ],
        selected: ['pro'],
        readout: 'Selected plan: {plan}',
      },
      { type: 'readout', id: 'left', label: 'Left over', value: '${= income - rent}' },
      {
        type: 'chart',
        id: 'split',
        title: 'Where it goes',
        chart: 'pie',
        series: [
          {
            name: 'Amount',
            points: [
              { x: 'Rent', y: '=rent' },
              { x: 'Other', y: 400 },
            ],
          },
        ],
      },
      {
        type: 'checklist',
        id: 'todo',
        title: 'Before payday',
        items: [
          { id: 'a', label: 'Pay rent', checked: true },
          { id: 'b', label: 'Move savings', checked: false },
        ],
      },
      {
        type: 'columns',
        id: 'plans',
        blocks: [
          { type: 'card', id: 'free_card', title: 'Free', subtitle: '$0', blocks: [] },
          {
            type: 'card',
            id: 'pro_card',
            title: 'Pro',
            badge: 'Popular',
            badgeTone: 'success',
            blocks: [{ type: 'text', id: 'pro_text', markdown: 'Everything in Free.' }],
          },
        ],
      },
      {
        type: 'map',
        id: 'cafes',
        title: 'Coffee',
        pins: [
          { id: 'p1', label: 'Blue Bottle', latitude: 37.78, longitude: -122.4, url: PIN_URL },
        ],
      },
      {
        type: 'actions',
        id: 'go',
        buttons: [
          {
            id: 'apply',
            label: 'Apply',
            action: 'send',
            template: 'Rebalance my budget: income {income}, rent {rent}, plan {plan}.',
            primary: true,
          },
          {
            id: 'copy_it',
            label: 'Copy',
            action: 'copy',
            template: 'Left {= income - rent}',
            primary: false,
          },
        ],
      },
      {
        type: 'suggestions',
        id: 'next',
        items: [{ id: 'more_examples', text: 'Show more examples' }],
      },
      {
        type: 'status',
        id: 'checks',
        items: [{ id: 'c1', label: 'Contrast', status: 'Passed', tone: 'success' }],
      },
    ],
  };
}

function envelope(body: unknown) {
  return {
    card: {
      schemaVersion: 1,
      cardId: 'answer-ui-toolu_1',
      kind: ANSWER_UI_CARD_KIND,
      createdAt: '2026-10-25T10:00:00.000Z',
      fallback: { headline: 'Monthly budget', text: 'Income and rent sliders.' },
      producedBy: { toolCallId: 'toolu_1', toolName: 'render_answer_ui' },
      body,
    },
  };
}

function withBlock(block: unknown): unknown {
  return { blocks: [block] };
}

describe('answer UI card contract', () => {
  it('accepts a body that uses every bound control', () => {
    const parsed = parseInteractiveCardDelta(envelope(budgetBody()));
    expect(parsed?.recognized).toBe(true);
    expect(parsed?.kind).toBe(ANSWER_UI_CARD_KIND);
  });

  it.each([
    [
      'a script tag in markdown',
      { type: 'text', id: 't', markdown: 'hi <script>alert(1)</script>' },
    ],
    [
      'an html image in a label',
      { type: 'heading', id: 'h', text: '<img src=x onerror=alert(1)>', level: 2 },
    ],
    [
      'an http gallery image',
      { type: 'gallery', id: 'g', images: [{ url: 'http://x.test/a.png', alt: 'a' }] },
    ],
    [
      'a javascript link button',
      {
        type: 'actions',
        id: 'a',
        buttons: [
          { id: 'b', label: 'Go', action: 'link', url: 'javascript:alert(1)', primary: false },
        ],
      },
    ],
    [
      'a map pin that is not a maps search',
      {
        type: 'map',
        id: 'm',
        title: 'Map',
        pins: [{ id: 'p', label: 'X', latitude: 1, longitude: 1, url: 'https://evil.test/?q=1' }],
      },
    ],
    ['an id that is not an identifier', { type: 'text', id: 'Bad Id', markdown: 'x' }],
    ['an unknown block type', { type: 'iframe', id: 'i', src: 'https://x.test' }],
    [
      'a readout bound to no control',
      { type: 'readout', id: 'r', label: 'Total', value: '{missing}' },
    ],
    [
      'a radio with two selections',
      {
        type: 'choice',
        id: 'c',
        label: 'C',
        style: 'radio',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        selected: ['a', 'b'],
      },
    ],
    [
      'a slider value off its step',
      { type: 'slider', id: 's', label: 'S', min: 0, max: 10, step: 2, value: 3 },
    ],
    [
      'a table row with the wrong width',
      { type: 'table', id: 't', columns: ['A', 'B'], rows: [['1']] },
    ],
    [
      'scatter points without numeric x',
      {
        type: 'chart',
        id: 'c',
        title: 'C',
        chart: 'scatter',
        series: [{ name: 's', points: [{ x: 'a', y: 1 }] }],
      },
    ],
  ])('rejects %s', (_label, block) => {
    expect(AnswerUiCardBodySchema.safeParse(withBlock(block)).success).toBe(false);
    expect(parseInteractiveCardDelta(envelope(withBlock(block)))?.recognized).toBe(false);
  });

  it('rejects nesting deeper than the limit', () => {
    const deep = {
      blocks: [
        {
          type: 'card',
          id: 'a',
          blocks: [
            {
              type: 'card',
              id: 'b',
              blocks: [
                { type: 'card', id: 'c', blocks: [{ type: 'text', id: 'd', markdown: 'x' }] },
              ],
            },
          ],
        },
      ],
    };
    expect(AnswerUiCardBodySchema.safeParse(deep).success).toBe(false);
  });

  it('rejects duplicate block ids and duplicate send targets', () => {
    expect(
      AnswerUiCardBodySchema.safeParse({
        blocks: [
          { type: 'text', id: 'same', markdown: 'a' },
          { type: 'text', id: 'same', markdown: 'b' },
        ],
      }).success,
    ).toBe(false);
    expect(
      AnswerUiCardBodySchema.safeParse({
        blocks: [
          { type: 'suggestions', id: 's', items: [{ id: 'go', text: 'A' }] },
          {
            type: 'actions',
            id: 'a',
            buttons: [{ id: 'go', label: 'B', action: 'send', primary: true }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects more blocks than the limit', () => {
    const blocks = Array.from({ length: ANSWER_UI_LIMITS.maxNodes + 1 }, (_, index) => ({
      type: 'text',
      id: `t${index}`,
      markdown: 'x',
    }));
    expect(AnswerUiCardBodySchema.safeParse({ blocks }).success).toBe(false);
  });

  it('drops a card whose serialized size passes the envelope limit', () => {
    const blocks = Array.from({ length: 8 }, (_, index) => ({
      type: 'text',
      id: `t${index}`,
      markdown: 'x'.repeat(ANSWER_UI_LIMITS.textLength),
    }));
    expect(AnswerUiCardBodySchema.safeParse({ blocks }).success).toBe(true);
    expect(parseInteractiveCardDelta(envelope({ blocks }))).toBeNull();
  });

  it('replays a persisted card from message metadata', () => {
    const { card } = envelope(budgetBody());
    const [replayed] = readPersistedInteractiveCards({ [INTERACTIVE_CARDS_METADATA_KEY]: [card] });
    expect(replayed?.recognized).toBe(true);
    if (!replayed?.recognized || replayed.kind !== ANSWER_UI_CARD_KIND)
      throw new Error('not replayed');
    expect(replayed.body).toEqual(budgetBody());
  });
});

describe('answer UI templates and messages', () => {
  it('parses arithmetic and refuses anything else', () => {
    expect(parseAnswerUiExpression('income - (rent + 2) * 3 / 4')).not.toBeNull();
    expect(parseAnswerUiExpression('alert(1)')).toBeNull();
    expect(parseAnswerUiExpression('income; rent')).toBeNull();
    expect(parseAnswerUiExpression('constructor.prototype')).toBeNull();
  });

  it('renders live readouts from the current values', () => {
    const body = budgetBody();
    const controls = answerUiControls(body);
    const values = { ...answerUiInitialValues(body), rent: 2_000 };
    expect(renderAnswerUiTemplate('Left ${= income - rent}', controls, values)).toBe('Left $3,000');
    expect(renderAnswerUiTemplate('Selected plan: {plan}', controls, values)).toBe(
      'Selected plan: Pro',
    );
    expect(renderAnswerUiTemplate('{todo}', controls, values)).toBe('1 of 2 done');
  });

  it('composes the follow-up message from the template and the chosen values', () => {
    const result = composeAnswerUiMessage(budgetBody(), 'apply', { rent: 2_100, plan: ['free'] });
    expect(result).toEqual({
      ok: true,
      text: 'Rebalance my budget: income $5,000, rent $2,100, plan Free.',
    });
  });

  it('sends a suggestion as written', () => {
    expect(composeAnswerUiMessage(budgetBody(), 'more_examples', {})).toEqual({
      ok: true,
      text: 'Show more examples',
    });
  });

  it.each([
    ['a slider value out of range', 'apply', { rent: 9_999_999 }],
    ['a slider value off its step', 'apply', { rent: 1_801 }],
    ['an option the card never offered', 'apply', { plan: ['enterprise'] }],
    ['two options on a radio', 'apply', { plan: ['free', 'pro'] }],
    ['a control the card does not have', 'apply', { injected: 'x' }],
    ['a copy button used as a send', 'copy_it', {}],
    ['an action the card does not have', 'nope', {}],
  ])('refuses %s', (_label, actionId, values) => {
    expect(composeAnswerUiMessage(budgetBody(), actionId, values).ok).toBe(false);
  });
});

describe('answer UI html detection', () => {
  it.each([
    '<b>',
    '</b>',
    '<br/>',
    '<br />',
    '<A-1>',
    '<img src=x onerror=alert(1)>',
    '<a\thref="x">',
    '<a\nhref="x"/>',
    'text <i>x</i> text',
    '<!-- note -->',
    '<!---->',
    '<!--a-->b',
    'a < b <b>',
    '<a <b>',
    '<a\u00a0x>',
  ])('finds markup in %j', (value) => {
    expect(containsAnswerUiHtml(value)).toBe(true);
  });

  it.each([
    '',
    'plain text',
    'a < b and c > d',
    '<>',
    '</>',
    '< b>',
    '<1a>',
    '<//a>',
    '<a/ >',
    '<a',
    '<a x',
    '<a x <b',
    '<a/',
    '<!-->',
    '<!--',
    '<!-- never closed',
    '<!- - -->',
    '<a-b_c>',
    '<\u212a>',
  ])('leaves %j alone', (value) => {
    expect(containsAnswerUiHtml(value)).toBe(false);
  });

  it('removes tags and comments and keeps the text between them', () => {
    expect(removeAnswerUiHtml('a <b>bold</b> <!-- c --> d')).toBe('a bold  d');
    expect(removeAnswerUiHtml('no markup')).toBe('no markup');
    expect(removeAnswerUiHtml('<scr<b>ipt>')).toBe('<script>');
    expect(removeAnswerUiHtml('<!<!-- x -->-- y -->')).toBe('<!-- y -->');
  });

  it.each([
    ['unclosed comment openers', '<!--'.repeat(25_000)],
    ['unclosed tags', '<a '.repeat(33_000)],
    ['bare angle brackets', '<'.repeat(100_000)],
    ['a long attribute run', `<a ${'x '.repeat(50_000)}`],
    ['a long tag name', `<${'a'.repeat(100_000)}`],
    ['interleaved openers', '<a <!-- '.repeat(12_000)],
  ])('answers %s of 100000 characters in linear time', (_label, value) => {
    const started = performance.now();
    expect(containsAnswerUiHtml(value)).toBe(false);
    expect(removeAnswerUiHtml(value)).toBe(value);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('rejects a card whose text hides markup behind a long prefix', () => {
    const hidden = `${'<!--'.repeat(400)}<i>x</i>`;
    const result = AnswerUiCardBodySchema.safeParse({
      blocks: [{ type: 'text', id: 't', markdown: hidden }],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('html is not allowed');
  });
});
