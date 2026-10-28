import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MermaidDiagramModule = typeof import('../MermaidDiagram');
type HighlightedCodeModule = typeof import('../HighlightedCode');

vi.mock('../MermaidDiagram', async (importOriginal) => ({
  ...(await importOriginal<MermaidDiagramModule>()),
  MermaidDiagram: () => null,
}));

vi.mock('../HighlightedCode', async (importOriginal) => ({
  ...(await importOriginal<HighlightedCodeModule>()),
  HighlightedCode: ({ code, language }: { code: string; language: string }) => (
    <code data-testid="highlighted" data-language={language}>
      {code}
    </code>
  ),
}));

const { MarkdownContent } = await import('../MarkdownContent');

function fence(language: string, body: string): string {
  return ['```' + language, body, '```'].join('\n');
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe('answer surfaces', () => {
  it('renders cards and a real comparison table, not a pipe string', () => {
    const { container } = render(
      <MarkdownContent
        content={[
          fence('cards', 'Fast | Quick responses\nAdvanced | Complex analysis'),
          '',
          '| Feature | Basic |',
          '| --- | --- |',
          '| Text | Yes |',
        ].join('\n')}
      />,
    );

    expect(container.querySelector('[data-answer-surface="cards"]')?.textContent).toContain('Fast');
    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Feature' })).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('keeps a radio selection on one option and shows that option', () => {
    render(
      <MarkdownContent
        content={fence('radio', 'prompt: Choose a plan\n- Free plan\n- Plus plan\n* Pro plan')}
      />,
    );

    expect(screen.getByText('Selected: Pro plan')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Plus plan'));
    expect(screen.getByText('Selected: Plus plan')).toBeTruthy();
    expect(screen.getByLabelText('Free plan')).toHaveProperty('checked', false);
  });

  it('updates the slider amount as the value changes', () => {
    render(
      <MarkdownContent
        content={fence('slider', 'label: Monthly budget\nmin: 0\nmax: 500\nvalue: 100\nprefix: $')}
      />,
    );

    expect(screen.getByText('$100')).toBeTruthy();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } });
    expect(screen.getByText('$250')).toBeTruthy();
  });

  it('updates a checkbox summary and keeps checklist labels spaced', () => {
    render(
      <MarkdownContent
        content={fence(
          'checks',
          'title: Preferences\n- [x] Enable web search\n- [ ] Include image generation',
        )}
      />,
    );

    expect(screen.getByText(/Enable web search: Enabled/)).toBeTruthy();
    expect(screen.getByText(/Include image generation: Disabled/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Include image generation'));
    expect(screen.getByText(/Include image generation: Enabled/)).toBeTruthy();
  });

  it('counts checklist progress, resets, and copies spaced labels', async () => {
    render(
      <MarkdownContent
        content={fence(
          'checklist',
          'title: QA Checklist\n- [ ] Verify chat rendering\n- [ ] Verify copy button',
        )}
      />,
    );

    expect(screen.getByText('0 of 2')).toBeTruthy();
    expect(screen.getByText('Verify chat rendering')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Verify chat rendering'));
    expect(screen.getByText('1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy checklist' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '[x] Verify chat rendering\n[ ] Verify copy button',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('0 of 2')).toBeTruthy();
  });

  it('updates the dropdown sentence from the chosen option', () => {
    render(
      <MarkdownContent
        content={fence('dropdown', 'label: Frequency\nselected: Weekly\n- Weekly\n- Monthly')}
      />,
    );

    expect(screen.getByText('Selected: Weekly')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Monthly' } });
    expect(screen.getByText('Selected: Monthly')).toBeTruthy();
  });

  it('shows gallery captions and moves Next to the next concept', () => {
    const { container } = render(
      <MarkdownContent
        content={fence('gallery', 'One | #1d4ed8\nTwo | #2563eb\nThree | #1e3a8a')}
      />,
    );

    expect(container.querySelectorAll('[data-gallery-swatch]')).toHaveLength(3);
    expect(container.querySelector('[data-gallery-slide="current"]')?.textContent).toContain('One');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(container.querySelector('[data-gallery-slide="current"]')?.textContent).toContain('Two');
  });

  it('discloses advanced settings and plots one chart whose axis fits the largest value', () => {
    const { container } = render(
      <MarkdownContent
        content={[
          fence('details', 'Advanced settings\nClick to expand or collapse'),
          '',
          fence(
            'chart',
            'title: Requests\nx: Month\ny: Requests\nJan | 120\nFeb | 190\nMar | 155\nApr | 280',
          ),
        ].join('\n')}
      />,
    );

    expect(screen.getByText('Advanced settings')).toBeTruthy();
    expect(screen.getByText('Click to expand or collapse')).toBeTruthy();
    expect(container.querySelectorAll('[data-answer-chart]')).toHaveLength(1);
    expect(
      Number(container.querySelector('[data-chart-axis]')?.getAttribute('data-chart-axis')),
    ).toBeGreaterThanOrEqual(280);
    expect(container.querySelector('[data-chart-bar="Apr"]')?.getAttribute('title')).toBe(
      'Apr: 280',
    );
    expect(screen.getByRole('cell', { name: '280' })).toBeTruthy();
  });

  it('labels map stops and only draws a map tile when coordinates exist', () => {
    const located = render(
      <MarkdownContent
        content={fence(
          'map',
          'Chicago | 41.88, -87.63 | Start\nIndianapolis | 39.77, -86.16 | Middle',
        )}
      />,
    );
    expect(located.container.querySelector('[data-map-tile]')).not.toBeNull();
    expect(located.container.textContent).toContain('Chicago');
    expect(located.container.textContent).toContain('Indianapolis');
    cleanup();

    const named = render(<MarkdownContent content={fence('map', 'Chicago | Start')} />);
    expect(named.container.querySelector('[data-map-tile]')).toBeNull();
    expect(named.container.textContent).toContain('Chicago');
  });

  it('copies a prompt, marks commands as not executed, and separates console from errors', async () => {
    render(
      <MarkdownContent
        content={[
          fence('prompt', 'Inspect the application.'),
          fence('commands', 'pnpm test'),
          fence('console', 'Total: $100'),
          fence('error', 'TypeError: Cannot read properties of undefined'),
        ].join('\n\n')}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy full prompt' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Inspect the application.');
    expect(screen.getByText(/have not been executed/)).toBeTruthy();
    expect(screen.getByText('Total: $100')).toBeTruthy();
    expect(screen.getByText(/TypeError/)).toBeTruthy();
    expect(document.querySelector('[data-output-kind="console"]')).not.toBeNull();
    expect(document.querySelector('[data-output-kind="error"]')).not.toBeNull();
  });

  it('renders status, actions, follow-ups, files, transcript, timeline, modes, and a citation', () => {
    const onFollowUp = vi.fn();
    const { container } = render(
      <MarkdownContent
        onFollowUp={onFollowUp}
        content={[
          fence(
            'status',
            'Authentication | Passed\nPayment processing | Failed\nEmail verification | Pending\nAccount settings | Not tested',
          ),
          fence('actions', 'Copy review note | The review is ready.'),
          fence('followups', '- Show more code\n- Show the document'),
          fence(
            'files',
            'website-qa-report.pdf | PDF | Summary\nconfig.json | JSON | Structured file',
          ),
          fence(
            'transcript',
            '00:12 | Speaker 1 | Outstanding defects\n00:19 | Speaker 2 | One needs testing',
          ),
          fence(
            'timeline',
            'Plan | Define scope | Complete\nTest | Run the suite | In progress\nDeploy | Release | Not started',
          ),
          fence(
            'modes',
            'Inline | Compact\nPicture-in-picture | Floating\nFullscreen | A larger surface',
          ),
          fence(
            'citation',
            'title: Working with writing blocks\nsource: Documentation\nurl: https://example.com/docs\nsummary: Official guidance.',
          ),
          'Release [[Completed]]',
        ].join('\n\n')}
      />,
    );

    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Not tested')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy review note' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('The review is ready.');
    fireEvent.click(screen.getByRole('button', { name: 'Show more code' }));
    expect(onFollowUp).toHaveBeenCalledWith('Show more code');
    expect(screen.getByText('website-qa-report.pdf')).toBeTruthy();
    expect(screen.getByText('JSON')).toBeTruthy();
    expect(screen.getByText(/not an audio player/)).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText(/do not change this chat/)).toBeTruthy();
    expect(container.querySelector('a[href="https://example.com/docs"]')).not.toBeNull();
    expect(container.querySelector('[data-answer-badge]')?.textContent).toBe('Completed');
  });

  it('lets a document, message, and social post be typed in', () => {
    render(
      <MarkdownContent
        content={[
          fence('document', 'Website QA Report'),
          fence('message', 'The build is ready.'),
          fence('post', 'Introducing a simpler way.'),
        ].join('\n\n')}
      />,
    );

    const documentField = screen.getByRole('textbox', { name: 'Document' });
    fireEvent.change(documentField, { target: { value: 'i am able to write here' } });
    expect(documentField).toHaveProperty('value', 'i am able to write here');
    expect(screen.getByRole('textbox', { name: 'Chat message' })).toHaveProperty(
      'value',
      'The build is ready.',
    );
    expect(screen.getByRole('textbox', { name: 'Social post' })).toHaveProperty(
      'value',
      'Introducing a simpler way.',
    );
  });

  it('previews html, colors a diff, and marks a shell block as not executed', () => {
    const { container } = render(
      <MarkdownContent
        content={[
          fence('html', '<h1>Hello, user!</h1><button>Click me</button>'),
          fence('diff', '- return price + quantity;\n+ return price * quantity;'),
          fence('bash', 'pnpm test'),
          'The identity $E = mc^2$ still holds.',
        ].join('\n\n')}
      />,
    );

    const preview = container.querySelector('iframe[data-html-preview]');
    expect(preview?.getAttribute('srcdoc')).toContain('Hello, user!');
    expect(preview?.getAttribute('srcdoc')).toContain('Click me');
    expect(container.querySelector('[data-diff-kind="remove"]')?.textContent).toContain(
      'price + quantity',
    );
    expect(container.querySelector('[data-diff-kind="add"]')?.textContent).toContain(
      'price * quantity',
    );
    expect(container.querySelector('[data-command-notice]')?.textContent).toMatch(
      /not been executed/,
    );
    expect(container.querySelector('.katex')).not.toBeNull();
  });
});

describe('answer blocks this round adds or repairs', () => {
  it('asks before loading a gallery image from a host this turn did not return', () => {
    const { container } = render(
      <MarkdownContent
        content={fence('gallery', 'Dashboard | https://images.example.net/dash.png')}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-image-state="blocked"]')?.textContent).toContain(
      'images.example.net',
    );
    fireEvent.click(screen.getByRole('button', { name: /load image from images\.example\.net/i }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://images.example.net/dash.png',
    );
  });

  it('loads a gallery image this turn returned without asking', () => {
    const { container } = render(
      <MarkdownContent
        content={fence('gallery', 'Chart | https://cdn.example.org/chart.png')}
        trustedImageUrls={['https://cdn.example.org/chart.png']}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.org/chart.png',
    );
  });

  it('plots a chart fence written as a full definition instead of printing its JSON', () => {
    const spec = JSON.stringify({
      type: 'line',
      title: 'Latency over time',
      xKey: 'day',
      data: [
        { day: 'Mon', ms: 340 },
        { day: 'Tue', ms: 300 },
      ],
    });
    const { container } = render(<MarkdownContent content={fence('chart', spec)} />);

    expect(container.querySelector('[data-answer-fallback]')).toBeNull();
    expect(
      container.querySelector('[data-testid="chart-artifact"]')?.getAttribute('data-chart-kind'),
    ).toBe('line');
  });

  it('draws a one-line fence with no language as a code block that can wrap, not an inline chip', () => {
    const { container } = render(
      <MarkdownContent
        content={'Before\n\n```\nprint(calculate_metrics(scores))\n```\n\nAfter `x = 1` inline.'}
      />,
    );

    expect(container.querySelector('.code-block-container')).not.toBeNull();
    expect(container.querySelector('.code-block-container')?.textContent).toContain(
      'print(calculate_metrics(scores))',
    );
    expect(container.querySelectorAll('.code-block-container')).toHaveLength(1);
  });

  it('underlines a link and marks one that opens elsewhere', () => {
    const { container } = render(
      <MarkdownContent
        content={'[OpenAI](https://openai.com?utm_source=chatgpt.com) and [notes](#notes).'}
      />,
    );
    const [external, local] = Array.from(container.querySelectorAll('a'));

    expect(external?.getAttribute('href')).toBe('https://openai.com/');
    expect(external?.className).toContain('underline');
    expect(external?.querySelector('[data-external-link-icon]')).not.toBeNull();
    expect(local?.querySelector('[data-external-link-icon]')).toBeNull();
  });
});
