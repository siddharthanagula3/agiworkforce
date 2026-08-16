import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublishedArtifactView } from './PublishedArtifactView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('@/features/chat/components/SandboxedIframe', () => ({
  SandboxedIframe: (props: {
    payload: { kind: string };
    fallbackSrcDoc: string;
    title: string;
  }) => (
    <div
      data-testid="sandboxed-frame"
      data-kind={props.payload.kind}
      data-fallback={props.fallbackSrcDoc}
    />
  ),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

const BASE = {
  title: 'Published thing',
  language: null,
  publishedAt: '2026-08-05T00:00:00.000Z',
};

describe('PublishedArtifactView', () => {
  it('serves html through the sandbox frame, never inline', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="html"
        content='<h1 id="marker">hi</h1><script>window.__pwned = 1</script>'
      />,
    );
    const frame = screen.getByTestId('sandboxed-frame');
    expect(frame).toHaveAttribute('data-kind', 'html');
    expect(document.getElementById('marker')).toBeNull();
    expect(document.querySelector('main script')).toBeNull();
  });

  it('serves react through the sandbox frame', () => {
    render(
      <PublishedArtifactView {...BASE} kind="react" content="const App = () => <div>hi</div>;" />,
    );
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-kind', 'react');
  });

  it('serves mermaid through the sandbox frame rather than running the parser here', () => {
    render(<PublishedArtifactView {...BASE} kind="mermaid" content="graph TD; A-->B;" />);
    expect(screen.getByTestId('sandboxed-frame')).toHaveAttribute('data-kind', 'mermaid');
  });

  it('renders svg as an inert image, not as injected markup', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="svg"
        content='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect /></svg>'
      />,
    );
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;/);
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).not.toContain('alert(1)');
    expect(document.querySelector('main svg')).toBeNull();
  });

  it('renders markdown through the sanitising markdown chain, with no frame', () => {
    render(<PublishedArtifactView {...BASE} kind="markdown" content="# Title" />);
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Title');
  });

  it('renders code as escaped text, so published source cannot become markup', () => {
    render(
      <PublishedArtifactView
        {...BASE}
        kind="code"
        language="js"
        content='<img src=x onerror="alert(1)">'
      />,
    );
    expect(screen.queryByTestId('sandboxed-frame')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector('main img')).toBeNull();
  });

  it('falls back to a readable heading when the artifact has no title', () => {
    render(<PublishedArtifactView {...BASE} title="" kind="code" content="x" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Published artifact');
  });
});
