import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { AnswerUiBlock, AnswerUiCardBody } from '@agiworkforce/types';

vi.mock('leaflet', async () => await import('@/test/__mocks__/leaflet'));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

import { resetLeafletMock } from '@/test/__mocks__/leaflet';
import { resetMapTileConfigCache } from '../map/mapTileConfig';
import { MAP_ENTER_FULLSCREEN_LABEL, MAP_EXIT_FULLSCREEN_LABEL } from '../map/LeafletMapCanvas';
import { AnswerUiCard, type AnswerUiCardContext } from './AnswerUiCard';
import { ANSWER_UI_CHART_DATA_LABEL } from './AnswerUiChart';

const TILE_CONFIG = {
  tileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}',
  attribution: 'Map data from OpenStreetMap contributors',
  darkTileUrlTemplate: '/api/maps/tile/{z}/{x}/{y}?style=dark',
  darkAttribution: 'Map data from OpenStreetMap contributors, dark tiles',
  dimLightTiles: false,
  minZoom: 2,
  maxZoom: 19,
};

const writeText = vi.fn(async () => undefined);

function renderCard(blocks: AnswerUiBlock[], ctx: Partial<AnswerUiCardContext> = {}) {
  const body: AnswerUiCardBody = { blocks };
  return render(
    <AnswerUiCard
      body={body}
      label="Answer"
      ctx={{ canRespond: false, canSend: true, ...ctx } as AnswerUiCardContext}
    />,
  );
}

const RENT: AnswerUiBlock = {
  type: 'slider',
  id: 'rent',
  label: 'Rent',
  min: 0,
  max: 4000,
  step: 100,
  value: 1500,
  unit: '$',
  unitPosition: 'prefix',
  readout: 'Rent takes {= rent / 50}% of 5,000',
};

beforeEach(() => {
  resetLeafletMock();
  resetMapTileConfigCache();
  writeText.mockClear();
  toastMocks.success.mockClear();
  toastMocks.error.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(TILE_CONFIG), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AnswerUiCard controls', () => {
  it('updates the slider value and its readout live, with no message sent', () => {
    const onSendMessage = vi.fn(async () => undefined);
    renderCard([RENT], { onSendMessage });
    const slider = screen.getByRole('slider', { name: 'Rent' });
    expect(screen.getByTestId('answer-ui-slider-value')).toHaveTextContent('$1,500');
    expect(slider).toHaveAttribute('aria-valuetext', '$1,500');

    fireEvent.change(slider, { target: { value: '2000' } });

    expect(screen.getByTestId('answer-ui-slider-value')).toHaveTextContent('$2,000');
    expect(slider).toHaveAttribute('aria-valuetext', '$2,000');
    expect(screen.getByTestId('answer-ui-readout')).toHaveTextContent('Rent takes 40% of 5,000');
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('binds a radio choice to its readout and a computed stat', () => {
    renderCard([
      {
        type: 'choice',
        id: 'plan',
        label: 'Plan',
        style: 'radio',
        options: [
          { id: 'free', label: 'Free' },
          { id: 'pro', label: 'Pro' },
        ],
        selected: ['free'],
        readout: 'Selected plan: {plan}',
      },
    ]);
    const group = screen.getByRole('group', { name: 'Plan' });
    expect(within(group).getByRole('radio', { name: 'Free' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Pro' }));
    expect(screen.getByTestId('answer-ui-readout')).toHaveTextContent('Selected plan: Pro');
  });

  it('lets checkboxes collect several options and a dropdown pick one', () => {
    renderCard([
      {
        type: 'choice',
        id: 'extras',
        label: 'Extras',
        style: 'checkbox',
        options: [
          { id: 'sso', label: 'SSO' },
          { id: 'audit', label: 'Audit log' },
        ],
        selected: [],
        readout: 'Your configuration: {extras}',
      },
      {
        type: 'choice',
        id: 'freq',
        label: 'Frequency',
        style: 'dropdown',
        options: [
          { id: 'daily', label: 'Daily' },
          { id: 'weekly', label: 'Weekly' },
        ],
        selected: ['daily'],
        readout: 'Selected frequency: {freq}',
      },
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'SSO' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Audit log' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Frequency' }), {
      target: { value: 'weekly' },
    });
    const readouts = screen.getAllByTestId('answer-ui-readout');
    expect(readouts[0]).toHaveTextContent('Your configuration: SSO, Audit log');
    expect(readouts[1]).toHaveTextContent('Selected frequency: Weekly');
  });

  it('reads a typed number into a live total', () => {
    renderCard([
      { type: 'input', id: 'people', label: 'People', inputType: 'number', value: '2' },
      { type: 'input', id: 'bill', label: 'Bill', inputType: 'number', value: '120' },
      { type: 'readout', id: 'each', label: 'Each pays', value: '${= bill / people}' },
    ]);
    expect(screen.getByTestId('answer-ui-stat')).toHaveTextContent('$60');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'People' }), {
      target: { value: '3' },
    });
    expect(screen.getByTestId('answer-ui-stat')).toHaveTextContent('$40');
  });
});

describe('AnswerUiCard checklist', () => {
  const CHECKLIST: AnswerUiBlock = {
    type: 'checklist',
    id: 'qa',
    title: 'Website QA',
    items: [
      { id: 'links', label: 'Check links', checked: true },
      { id: 'forms', label: 'Test forms', checked: false },
      { id: 'mobile', label: 'Check mobile layout', checked: false },
      { id: 'speed', label: 'Measure speed', checked: false },
    ],
  };

  it('tracks progress, resets to the starting state and copies the list', async () => {
    renderCard([CHECKLIST]);
    const progress = screen.getByRole('progressbar', { name: 'Website QA progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByTestId('answer-ui-checklist-progress')).toHaveTextContent(
      '1 of 4 done · 25%',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Test forms' }));
    expect(progress).toHaveAttribute('aria-valuenow', '50');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy checklist' }));
    });
    expect(writeText).toHaveBeenCalledWith(
      'Website QA\n- [x] Check links\n- [x] Test forms\n- [ ] Check mobile layout\n- [ ] Measure speed',
    );
    expect(toastMocks.success).toHaveBeenCalledWith('Copied');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByRole('checkbox', { name: 'Test forms' })).not.toBeChecked();
  });
});

describe('AnswerUiCard layout blocks', () => {
  it('renders a table as real cells and never as pipe markdown', () => {
    renderCard([
      {
        type: 'table',
        id: 'plans',
        caption: 'Plans',
        columns: ['Plan', 'Price'],
        rows: [
          ['Free', '$0'],
          ['Pro', '$20 | month'],
        ],
      },
    ]);
    const table = screen.getByRole('table', { name: 'Plans' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Plan', 'Price']);
    expect(within(table).getByRole('rowheader', { name: 'Pro' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '$20 | month' })).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/\|\s*-{3}/);
  });

  it('renders markdown text through the chat markdown pipeline, so a pipe table becomes a table', async () => {
    renderCard([{ type: 'text', id: 'md', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' }]);
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.getByTestId('answer-ui-text').textContent).not.toContain('| --- |');
  });

  it('opens and closes a disclosure from the keyboard-reachable summary', () => {
    renderCard([
      {
        type: 'disclosure',
        id: 'advanced',
        summary: 'Advanced settings',
        open: false,
        blocks: [{ type: 'heading', id: 'inner', text: 'Hidden detail', level: 3 }],
      },
    ]);
    const details = screen.getByTestId('answer-ui-disclosure') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText('Advanced settings'));
    expect(details.open).toBe(true);
  });

  it('draws a chart with an accessible data table that follows a slider', () => {
    renderCard([
      RENT,
      {
        type: 'chart',
        id: 'spend',
        title: 'Spending',
        chart: 'bar',
        series: [
          {
            name: 'USD',
            points: [
              { x: 'Rent', y: '=rent' },
              { x: 'Food', y: 400 },
            ],
          },
        ],
      },
    ]);
    const figure = screen.getByRole('figure', { name: 'Spending' });
    expect(figure).toHaveAccessibleDescription(/Bar chart of 2 points/);
    expect(screen.getByText(ANSWER_UI_CHART_DATA_LABEL)).toBeInTheDocument();
    const table = screen.getByTestId('answer-ui-chart-table');
    expect(within(table).getByRole('rowheader', { name: 'Rent' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '1,500' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Rent' }), { target: { value: '2000' } });
    expect(within(table).getByRole('cell', { name: '2,000' })).toBeInTheDocument();
  });

  it('shows gallery images behind the same load-image rule as answer markdown', async () => {
    renderCard([
      {
        type: 'gallery',
        id: 'pics',
        images: [{ url: 'https://images.test/a.png', alt: 'A cafe', caption: 'Morning light' }],
      },
    ]);
    expect(screen.getByText('Morning light')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Load image from images\.test/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'A cafe' })).not.toBeInTheDocument();
  });

  it('loads a gallery image the turn already retrieved', async () => {
    renderCard(
      [
        {
          type: 'gallery',
          id: 'pics',
          images: [{ url: 'https://images.test/a.png', alt: 'A cafe' }],
        },
      ],
      { trustedImageUrls: ['https://images.test/a.png'] },
    );
    expect(await screen.findByRole('img', { name: 'A cafe' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
  });

  it('puts a map in full screen and back, with links to each pin', async () => {
    renderCard([
      {
        type: 'map',
        id: 'cafes',
        title: 'Coffee near Union Square',
        pins: [
          {
            id: 'p1',
            label: 'Blue Bottle',
            latitude: 37.787,
            longitude: -122.407,
            url: 'https://www.google.com/maps/search/?api=1&query=Blue+Bottle',
          },
        ],
      },
    ]);
    const enter = await screen.findByRole('button', { name: MAP_ENTER_FULLSCREEN_LABEL });
    fireEvent.click(enter);
    expect(
      await screen.findByRole('dialog', { name: 'Map: Coffee near Union Square' }),
    ).toBeInTheDocument();
    const exit = screen.getByRole('button', { name: MAP_EXIT_FULLSCREEN_LABEL });
    expect(exit).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Blue Bottle in Maps/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Blue+Bottle',
    );
  });
});

describe('AnswerUiCard lists and panels', () => {
  it('renders status badges, numbered steps, key values, files and a transcript', () => {
    renderCard([
      {
        type: 'status',
        id: 'checks',
        title: 'Checks',
        items: [
          { id: 'a', label: 'Contrast', status: 'Failed', tone: 'danger' },
          { id: 'b', label: 'Links', status: 'Passed', tone: 'success' },
        ],
      },
      {
        type: 'steps',
        id: 'flow',
        title: 'Release',
        items: [
          { id: 's1', title: 'Plan', status: 'Complete', tone: 'success' },
          { id: 's2', title: 'Ship', status: 'Not started', tone: 'neutral' },
        ],
      },
      { type: 'keyvalue', id: 'kv', items: [{ label: 'Owner', value: 'Platform' }] },
      {
        type: 'files',
        id: 'docs',
        items: [{ id: 'f', name: 'report.pdf', fileType: 'PDF', description: 'Q3 report' }],
      },
      {
        type: 'transcript',
        id: 'call',
        items: [{ time: '00:12', speaker: 'Ana', text: 'Let us start.' }],
      },
    ]);
    expect(screen.getByText('Failed')).toHaveAttribute('data-tone', 'danger');
    expect(screen.getByText('Passed')).toHaveAttribute('data-tone', 'success');
    const steps = within(screen.getByTestId('answer-ui-steps')).getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent('1PlanComplete');
    expect(screen.getByText('Owner').tagName).toBe('DT');
    const file = screen.getByTestId('answer-ui-files');
    expect(within(file).getByText('Example')).toBeInTheDocument();
    expect(within(file).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('answer-ui-transcript')).toHaveTextContent('00:12Ana: Let us start.');
  });

  it('copies a copy-ready block with its full-width button', async () => {
    renderCard([
      {
        type: 'copy',
        id: 'prompt',
        title: 'Prompt',
        badge: 'Copy-ready',
        text: 'Act as a QA lead.',
        buttonLabel: 'Copy full prompt',
      },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy full prompt' }));
    });
    expect(writeText).toHaveBeenCalledWith('Act as a QA lead.');
  });
});

describe('AnswerUiCard actions', () => {
  const ACTIONS: AnswerUiBlock = {
    type: 'actions',
    id: 'go',
    buttons: [
      { id: 'apply', label: 'Apply', action: 'send', template: 'Use rent {rent}', primary: true },
      {
        id: 'copy_it',
        label: 'Copy summary',
        action: 'copy',
        template: 'Rent {rent}',
        primary: false,
      },
      { id: 'reset_all', label: 'Start over', action: 'reset', primary: false },
      {
        id: 'docs',
        label: 'Docs',
        action: 'link',
        url: 'https://example.com/docs',
        primary: false,
      },
    ],
  };

  it('sends the current values, copies, resets and links out', async () => {
    const onSendMessage = vi.fn(async () => undefined);
    renderCard(
      [
        RENT,
        ACTIONS,
        { type: 'suggestions', id: 'next', items: [{ id: 'more', text: 'Show yearly' }] },
      ],
      {
        onSendMessage,
      },
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Rent' }), { target: { value: '2000' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });
    expect(onSendMessage).toHaveBeenCalledWith('apply', { rent: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show yearly' }));
    });
    expect(onSendMessage).toHaveBeenLastCalledWith('more', { rent: 2000 });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    });
    expect(writeText).toHaveBeenCalledWith('Rent $2,000');

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByTestId('answer-ui-slider-value')).toHaveTextContent('$1,500');

    expect(screen.getByRole('link', { name: /Docs/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('keeps send buttons and suggestions disabled with the reason while the reply streams', () => {
    renderCard(
      [
        RENT,
        ACTIONS,
        { type: 'suggestions', id: 'next', items: [{ id: 'more', text: 'Show yearly' }] },
      ],
      {
        canSend: false,
        sendBlockedReason: 'Available when the reply finishes.',
      },
    );
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    expect(apply).toHaveAccessibleDescription('Available when the reply finishes.');
    expect(screen.getByRole('button', { name: 'Show yearly' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Rent' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copy summary' })).toBeEnabled();
  });

  it('reports a send that the server refused', async () => {
    const onSendMessage = vi.fn(async () => {
      throw new Error('400');
    });
    renderCard([RENT, ACTIONS], { onSendMessage });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    });
    expect(toastMocks.error).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });
});
