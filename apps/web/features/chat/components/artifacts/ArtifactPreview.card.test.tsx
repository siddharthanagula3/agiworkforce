import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { ArtifactPreview, type ArtifactData } from './ArtifactPreview';
import { classifyArtifactDocument } from './artifact-document-classification';

const sanitiser = vi.hoisted(() => ({ withoutDom: false }));

vi.mock('dompurify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dompurify')>();
  const domless = { isSupported: false };
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key, receiver) =>
        sanitiser.withoutDom ? Reflect.get(domless, key) : Reflect.get(target, key, receiver),
    }),
  };
});

afterEach(() => {
  sanitiser.withoutDom = false;
  vi.restoreAllMocks();
});

const SQL_SOURCE = `CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);`;

const TEXT_SOURCE = `Release checklist
1. Freeze the branch
2. Tag the build`;

const HTML_SOURCE = '<button class="cta">Reserve a seat</button>';

const HIGHLIGHT_SOURCE = `SELECT id, email
FROM accounts
WHERE created_at > now();`;

const REACT_SOURCE = `export default function Seat({ label }: { label: string }) {
  return <button type="button">{label}</button>;
}`;

const MERMAID_SOURCE = `flowchart LR
  request --> review --> release`;

const COMPANION_SOURCE = `SELECT label
FROM seats
WHERE reserved = false;`;

const SVG_SCRIPT_MARKER = 'agi-unsanitised-script';
const SVG_SHAPE_ID = 'agi-source-shape';
const SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>parent.postMessage('${SVG_SCRIPT_MARKER}', '*')</script><rect id="${SVG_SHAPE_ID}" width="10" height="10" onload="alert(1)"/></svg>`;

const HIGHLIGHT_TIMEOUT_MS = 15_000;

function artifact(overrides: Partial<ArtifactData>): ArtifactData {
  return {
    id: 'card-artifact',
    type: 'code',
    language: 'sql',
    title: 'Card artifact',
    content: SQL_SOURCE,
    ...overrides,
  };
}

function sourceRegion() {
  return screen.getByRole('region', { name: 'Artifact source' });
}

describe('ArtifactPreview card variant', () => {
  it('shows the source of a code artifact on first paint, with no tab strip to find it behind', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(sourceRegion().textContent).toBe(SQL_SOURCE);
    expect(sourceRegion()).toBeVisible();
  });

  it('shows the source of a document that has no rendered preview', () => {
    render(
      <ArtifactPreview
        artifact={artifact({ type: 'document', language: 'txt', content: TEXT_SOURCE })}
      />,
    );

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(sourceRegion().textContent).toBe(TEXT_SOURCE);
  });

  it('makes the source scroll region reachable from the keyboard', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    expect(sourceRegion()).toHaveAttribute('tabindex', '0');
  });

  it('still opens a previewable artifact on Preview and reveals its source from the Code tab', async () => {
    const user = userEvent.setup();
    render(
      <ArtifactPreview
        artifact={artifact({ type: 'html', language: 'html', content: HTML_SOURCE })}
      />,
    );

    const tabs = within(screen.getByRole('tablist'));
    expect(tabs.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Artifact source' })).toBeNull();

    await user.click(tabs.getByRole('tab', { name: 'Code' }));

    expect(tabs.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
    expect(sourceRegion().textContent).toBe(HTML_SOURCE);
  });

  it('fills the column it is placed in instead of shrinking to its own content', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    const card = screen.getByTestId('artifact-preview-card');
    expect(card).toHaveClass('w-full', 'min-w-0');
    expect(within(card).getByRole('region', { name: 'Artifact source' })).toBeInTheDocument();
  });

  it('writes the type badge in the text colour, not in the accent fill it sits on', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    const badge = screen.getByTestId('artifact-type-badge');
    expect(badge).toHaveTextContent('code');
    expect(badge).toHaveClass('text-foreground');
    expect(badge).not.toHaveClass('text-primary');
  });

  it('draws the source on the theme-following code surface instead of a fixed dark fill', () => {
    render(<ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />);

    const region = sourceRegion();
    expect(region).toHaveClass('code-block-body');
    expect(region).not.toHaveClass('bg-gray-900');
    expect(region.querySelector('.text-gray-100')).toBeNull();
    expect(region.querySelector('pre > code')).not.toBeNull();
  });

  it(
    'paints the source as plain text first and as highlighted tokens once the highlighter resolves',
    async () => {
      render(<ArtifactPreview artifact={artifact({ content: HIGHLIGHT_SOURCE })} />);

      const region = sourceRegion();
      expect(region.textContent).toBe(HIGHLIGHT_SOURCE);
      expect(region.querySelector('.shiki-token')).toBeNull();

      await waitFor(
        () => expect(region.querySelectorAll('.shiki-token').length).toBeGreaterThan(1),
        { timeout: HIGHLIGHT_TIMEOUT_MS },
      );
      expect(region.textContent).toBe(HIGHLIGHT_SOURCE);
    },
    HIGHLIGHT_TIMEOUT_MS * 2,
  );

  it(
    'highlights the source of a react artifact that names no language with the tsx grammar',
    async () => {
      const user = userEvent.setup();
      render(
        <ArtifactPreview
          artifact={artifact({ type: 'react', language: undefined, content: REACT_SOURCE })}
        />,
      );
      await user.click(screen.getByRole('tab', { name: 'Code' }));

      const region = sourceRegion();
      await waitFor(
        () => expect(region.querySelectorAll('.shiki-token').length).toBeGreaterThan(1),
        { timeout: HIGHLIGHT_TIMEOUT_MS },
      );
      expect(region.textContent).toBe(REACT_SOURCE);
    },
    HIGHLIGHT_TIMEOUT_MS * 2,
  );

  it(
    'leaves a mermaid source as plain text, because no mermaid grammar is loaded',
    async () => {
      const user = userEvent.setup();
      const mermaid = render(
        <ArtifactPreview
          artifact={artifact({ type: 'mermaid', language: undefined, content: MERMAID_SOURCE })}
        />,
      );
      await user.click(mermaid.getByRole('tab', { name: 'Code' }));
      const mermaidRegion = mermaid.getByRole('region', { name: 'Artifact source' });

      const companion = render(
        <ArtifactPreview artifact={artifact({ content: COMPANION_SOURCE })} />,
      );
      const companionRegion = within(companion.container).getByRole('region', {
        name: 'Artifact source',
      });
      await waitFor(
        () => expect(companionRegion.querySelectorAll('.shiki-token').length).toBeGreaterThan(1),
        { timeout: HIGHLIGHT_TIMEOUT_MS },
      );

      expect(mermaidRegion.querySelector('.shiki-token')).toBeNull();
      expect(mermaidRegion.textContent).toBe(MERMAID_SOURCE);
    },
    HIGHLIGHT_TIMEOUT_MS * 2,
  );

  it('lets a code-only source set its own height and keeps a previewable one at the preview height', async () => {
    const user = userEvent.setup();
    const codeOnly = render(
      <ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} />,
    );

    expect(sourceRegion()).toHaveClass('max-h-[500px]');
    expect(sourceRegion()).not.toHaveClass('h-[500px]');
    codeOnly.unmount();

    render(
      <ArtifactPreview
        artifact={artifact({ type: 'html', language: 'html', content: HTML_SOURCE })}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Code' }));

    expect(sourceRegion()).toHaveClass('h-[500px]');
    expect(sourceRegion()).not.toHaveClass('max-h-[500px]');
  });

  it.each([
    ['svg', SVG_SOURCE, SVG_SHAPE_ID],
    ['html', HTML_SOURCE, 'Reserve a seat'],
  ] as const)(
    'server-renders a %s artifact without a DOM sanitiser, hydrates without a mismatch and frames only sanitised markup',
    async (type, content, framedMarker) => {
      const element = <ArtifactPreview artifact={artifact({ type, language: type, content })} />;
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      sanitiser.withoutDom = true;
      const serverHtml = renderToString(element);
      sanitiser.withoutDom = false;

      expect(serverHtml).toContain('Loading the preview');
      expect(serverHtml).not.toContain('<iframe');
      expect(serverHtml).not.toContain(framedMarker);
      expect(serverHtml).not.toContain(SVG_SCRIPT_MARKER);

      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = serverHtml;
      const onRecoverableError = vi.fn();
      const root = await act(async () => hydrateRoot(container, element, { onRecoverableError }));

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();

      const framed = within(container).getByTitle('Card artifact').getAttribute('srcdoc') ?? '';
      expect(framed).toContain(framedMarker);
      expect(framed).not.toContain(SVG_SCRIPT_MARKER);
      expect(framed).not.toContain('onload=');

      act(() => root.unmount());
      container.remove();
    },
  );
});

describe('ArtifactPreview panel variant', () => {
  it('draws read-only source on the same code surface as the card', () => {
    const { container } = render(
      <ArtifactPreview artifact={artifact({ type: 'code', language: 'sql' })} variant="panel" />,
    );

    const surface = container.querySelector('.code-block-body');
    expect(surface?.textContent).toBe(SQL_SOURCE);
    expect(surface?.querySelector('pre > code')).not.toBeNull();
    expect(container.querySelector('.bg-gray-900, .text-gray-100')).toBeNull();
  });
});

describe('classifyArtifactDocument', () => {
  it.each([
    ['pdf', { isPdf: true, isDocx: false, isMarkdownDoc: false }],
    ['PDF', { isPdf: true, isDocx: false, isMarkdownDoc: false }],
    ['docx', { isPdf: false, isDocx: true, isMarkdownDoc: false }],
    ['doc', { isPdf: false, isDocx: true, isMarkdownDoc: false }],
    ['md', { isPdf: false, isDocx: false, isMarkdownDoc: true }],
    ['MDX', { isPdf: false, isDocx: false, isMarkdownDoc: true }],
    ['markdown', { isPdf: false, isDocx: false, isMarkdownDoc: true }],
    [undefined, { isPdf: false, isDocx: false, isMarkdownDoc: true }],
    ['txt', { isPdf: false, isDocx: false, isMarkdownDoc: false }],
    ['', { isPdf: false, isDocx: false, isMarkdownDoc: false }],
  ] as const)('classifies a document with language %s', (language, expected) => {
    expect(classifyArtifactDocument({ type: 'document', language })).toEqual(expected);
  });

  it('classifies nothing but a document, whatever its language says', () => {
    expect(classifyArtifactDocument({ type: 'code', language: 'pdf' })).toEqual({
      isPdf: false,
      isDocx: false,
      isMarkdownDoc: false,
    });
  });
});
