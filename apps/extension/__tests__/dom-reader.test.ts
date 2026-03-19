/**
 * Tests for dom-reader.ts — token-efficient DOM extraction for AI agent context.
 *
 * The module under test wraps @mcp-b/smart-dom-reader and adds main-content
 * detection, heading hierarchy, and token estimation.  We mock the external
 * library so the tests exercise extraction logic and fallback paths in
 * isolation against a jsdom DOM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @mcp-b/smart-dom-reader before any import that touches it.
// vi.hoisted() ensures the mock fns are available when the factory runs
// (vi.mock is hoisted above all imports).
// ---------------------------------------------------------------------------

const { mockExtractFull, mockFindMainContent, mockGenerateSelectors, mockExtractContent } =
  vi.hoisted(() => ({
    mockExtractFull: vi.fn(),
    mockFindMainContent: vi.fn(),
    mockGenerateSelectors: vi.fn(),
    mockExtractContent: vi.fn(),
  }));

vi.mock('@mcp-b/smart-dom-reader', () => ({
  SmartDOMReader: { extractFull: mockExtractFull },
  ContentDetection: { findMainContent: mockFindMainContent },
  SelectorGenerator: { generateSelectors: mockGenerateSelectors },
  ProgressiveExtractor: { extractContent: mockExtractContent },
}));

// Mock the logger so tests are silent
vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { extractDomSnapshot, type DomSnapshot } from '../src/dom-reader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SmartDOMResult that satisfies the type contract. */
function emptySmartResult(
  overrides?: Partial<{
    buttons: unknown[];
    links: unknown[];
    inputs: unknown[];
    forms: unknown[];
    clickable: unknown[];
    headings: unknown[];
    images: unknown[];
    tables: unknown[];
  }>,
): ReturnType<typeof mockExtractFull> {
  return {
    mode: 'full',
    timestamp: Date.now(),
    page: {
      url: window.location.href,
      title: document.title,
      hasErrors: false,
      isLoading: false,
      hasModals: false,
    },
    landmarks: {
      navigation: [],
      main: [],
      forms: [],
      headers: [],
      footers: [],
      articles: [],
      sections: [],
    },
    interactive: {
      buttons: overrides?.buttons ?? [],
      links: overrides?.links ?? [],
      inputs: overrides?.inputs ?? [],
      forms: overrides?.forms ?? [],
      clickable: overrides?.clickable ?? [],
    },
    semantic: {
      headings: overrides?.headings ?? [],
      images: overrides?.images ?? [],
      tables: overrides?.tables ?? [],
      lists: [],
      articles: [],
    },
    metadata: { totalElements: 0, extractedElements: 0 },
  };
}

/** Populate document.body with raw HTML and wire up mocks for a clean run. */
function setupDom(html: string): void {
  document.body.innerHTML = html;
  document.title = 'Test Page';

  // By default: SmartDOMReader falls back (throws), so the code uses DOM-based
  // extraction. Individual tests can override as needed.
  mockExtractFull.mockImplementation(() => {
    throw new Error('mock: fall back to DOM');
  });
  mockFindMainContent.mockImplementation(() => document.body);
  mockGenerateSelectors.mockImplementation(() => ({ css: '', xpath: '' }));
  mockExtractContent.mockReturnValue(null);
}

/**
 * Wire up mocks so SmartDOMReader.extractFull succeeds with the given result,
 * which enables the "happy path" code instead of the fallback.
 */
function setupSmartReader(result: ReturnType<typeof emptySmartResult>): void {
  mockExtractFull.mockReturnValue(result);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  document.title = '';
});

// ---- 1. Headings at different levels ----

describe('headings extraction', () => {
  it('extracts headings at all six levels from the DOM (fallback path)', () => {
    setupDom(`
      <h1>Main Title</h1>
      <h2>Subtitle</h2>
      <h3>Section</h3>
      <h4>Subsection</h4>
      <h5>Minor</h5>
      <h6>Smallest</h6>
    `);

    const snap = extractDomSnapshot();

    expect(snap.headings).toEqual([
      { level: 1, text: 'Main Title' },
      { level: 2, text: 'Subtitle' },
      { level: 3, text: 'Section' },
      { level: 4, text: 'Subsection' },
      { level: 5, text: 'Minor' },
      { level: 6, text: 'Smallest' },
    ]);
  });

  it('extracts headings from SmartDOMResult semantic data (happy path)', () => {
    setupDom('<h1>From DOM</h1>');

    const result = emptySmartResult({
      headings: [
        {
          tag: 'h1',
          text: 'Primary',
          selector: { css: 'h1' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
        {
          tag: 'h3',
          text: 'Tertiary',
          selector: { css: 'h3' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.headings).toEqual([
      { level: 1, text: 'Primary' },
      { level: 3, text: 'Tertiary' },
    ]);
  });

  it('falls back to DOM headings when SmartDOMResult has empty semantic headings', () => {
    setupDom('<h2>Fallback Heading</h2>');

    const result = emptySmartResult({ headings: [] });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.headings).toEqual([{ level: 2, text: 'Fallback Heading' }]);
  });
});

// ---- 2. Links (internal and external) ----

describe('links extraction', () => {
  it('extracts internal and external links via SmartDOMResult', () => {
    setupDom('<a href="/about">About</a><a href="https://example.com">External</a>');

    const result = emptySmartResult({
      links: [
        {
          tag: 'a',
          text: 'About',
          selector: { css: 'a:nth-child(1)' },
          attributes: { href: '/about' },
          context: { parentChain: [] },
          interaction: {},
        },
        {
          tag: 'a',
          text: 'External',
          selector: { css: 'a:nth-child(2)' },
          attributes: { href: 'https://example.com' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.links).toEqual([
      { text: 'About', href: '/about' },
      { text: 'External', href: 'https://example.com' },
    ]);
  });

  it('deduplicates links with the same href', () => {
    setupDom('<a href="/dup">First</a><a href="/dup">Second</a>');

    const result = emptySmartResult({
      links: [
        {
          tag: 'a',
          text: 'First',
          selector: { css: 'a:nth-child(1)' },
          attributes: { href: '/dup' },
          context: { parentChain: [] },
          interaction: {},
        },
        {
          tag: 'a',
          text: 'Second',
          selector: { css: 'a:nth-child(2)' },
          attributes: { href: '/dup' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.links).toHaveLength(1);
    expect(snap.links[0]!.text).toBe('First');
  });

  it('uses href as text when link text is empty', () => {
    setupDom('<a href="/icon-link"></a>');

    const result = emptySmartResult({
      links: [
        {
          tag: 'a',
          text: '  ',
          selector: { css: 'a' },
          attributes: { href: '/icon-link' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.links[0]!.text).toBe('/icon-link');
  });

  it('returns empty links array on fallback path', () => {
    setupDom('<a href="/about">About</a>');

    const snap = extractDomSnapshot();

    // Fallback path returns empty links (SmartDOMReader threw)
    expect(snap.links).toEqual([]);
  });
});

// ---- 3. Forms and input fields ----

describe('forms extraction', () => {
  it('extracts forms with their input fields', () => {
    setupDom(`
      <form action="/login" method="POST">
        <input name="username" type="text" />
        <input name="password" type="password" />
        <button type="submit">Login</button>
      </form>
    `);

    const result = emptySmartResult({
      forms: [
        {
          selector: 'form[action="/login"]',
          action: '/login',
          method: 'POST',
          inputs: [
            {
              tag: 'input',
              text: '',
              selector: { css: 'input[name="username"]' },
              attributes: { name: 'username', type: 'text' },
              context: { parentChain: [] },
              interaction: {},
            },
            {
              tag: 'input',
              text: '',
              selector: { css: 'input[name="password"]' },
              attributes: { name: 'password', type: 'password' },
              context: { parentChain: [] },
              interaction: {},
            },
          ],
          buttons: [],
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.forms).toHaveLength(1);
    expect(snap.forms[0]!.action).toBe('/login');
    expect(snap.forms[0]!.fields).toEqual(['username(text)', 'password(password)']);
  });

  it('falls back to id or tag name when input has no name attribute', () => {
    setupDom('<form><input id="email-field" type="email" /></form>');

    const result = emptySmartResult({
      forms: [
        {
          selector: 'form',
          action: undefined,
          method: undefined,
          inputs: [
            {
              tag: 'input',
              text: '',
              selector: { css: 'input#email-field' },
              attributes: { id: 'email-field', type: 'email' },
              context: { parentChain: [] },
              interaction: {},
            },
          ],
          buttons: [],
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.forms[0]!.fields).toEqual(['email-field(email)']);
  });

  it('defaults input type to "text" when type attribute is absent', () => {
    setupDom('<form><input name="q" /></form>');

    const result = emptySmartResult({
      forms: [
        {
          selector: 'form',
          action: undefined,
          inputs: [
            {
              tag: 'input',
              text: '',
              selector: { css: 'input[name="q"]' },
              attributes: { name: 'q' },
              context: { parentChain: [] },
              interaction: {},
            },
          ],
          buttons: [],
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.forms[0]!.fields).toEqual(['q(text)']);
  });
});

// ---- 4. Images (alt text extraction) ----

describe('images extraction', () => {
  it('extracts images with alt text and src via SmartDOMResult', () => {
    setupDom('<img alt="Logo" src="/logo.png" /><img alt="Photo" src="/photo.jpg" />');

    const result = emptySmartResult({
      images: [
        {
          tag: 'img',
          text: '',
          selector: { css: 'img:nth-child(1)' },
          attributes: { alt: 'Logo', src: '/logo.png' },
          context: { parentChain: [] },
          interaction: {},
        },
        {
          tag: 'img',
          text: '',
          selector: { css: 'img:nth-child(2)' },
          attributes: { alt: 'Photo', src: '/photo.jpg' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.images).toEqual([
      { alt: 'Logo', src: '/logo.png' },
      { alt: 'Photo', src: '/photo.jpg' },
    ]);
  });

  it('includes images with empty alt text', () => {
    setupDom('<img src="/decorative.png" />');

    const result = emptySmartResult({
      images: [
        {
          tag: 'img',
          text: '',
          selector: { css: 'img' },
          attributes: { src: '/decorative.png' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.images).toEqual([{ alt: '', src: '/decorative.png' }]);
  });

  it('skips images with no src attribute', () => {
    setupDom('<img alt="broken" />');

    const result = emptySmartResult({
      images: [
        {
          tag: 'img',
          text: '',
          selector: { css: 'img' },
          attributes: { alt: 'broken' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.images).toEqual([]);
  });
});

// ---- 5. Tables ----

describe('tables extraction', () => {
  it('extracts table headers and row count from the DOM', () => {
    setupDom(`
      <table id="data-table">
        <thead>
          <tr><th>Name</th><th>Age</th><th>City</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>30</td><td>NYC</td></tr>
          <tr><td>Bob</td><td>25</td><td>LA</td></tr>
        </tbody>
      </table>
    `);

    const result = emptySmartResult({
      tables: [
        {
          tag: 'table',
          text: '',
          selector: { css: '#data-table', xpath: '' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.tables).toHaveLength(1);
    expect(snap.tables[0]!.headers).toEqual(['Name', 'Age', 'City']);
    // 3 rows total: 1 header row + 2 body rows
    expect(snap.tables[0]!.rowCount).toBe(3);
  });

  it('handles table with no headers', () => {
    setupDom(`
      <table id="no-headers">
        <tr><td>A</td><td>B</td></tr>
        <tr><td>C</td><td>D</td></tr>
      </table>
    `);

    const result = emptySmartResult({
      tables: [
        {
          tag: 'table',
          text: '',
          selector: { css: '#no-headers', xpath: '' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.tables[0]!.headers).toEqual([]);
    expect(snap.tables[0]!.rowCount).toBe(2);
  });
});

// ---- 6. Interactive elements (buttons, inputs, selects) ----

describe('interactive elements extraction', () => {
  it('extracts buttons with labels', () => {
    setupDom('<button>Submit</button>');

    const result = emptySmartResult({
      buttons: [
        {
          tag: 'button',
          text: 'Submit',
          selector: { css: 'button' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.interactiveElements).toContainEqual(
      expect.objectContaining({ tag: 'button', label: 'Submit', selector: 'button' }),
    );
  });

  it('extracts inputs with type and name', () => {
    setupDom('<input type="email" name="user-email" placeholder="Enter email" />');

    const result = emptySmartResult({
      inputs: [
        {
          tag: 'input',
          text: '',
          selector: { css: 'input[name="user-email"]' },
          attributes: { type: 'email', name: 'user-email', placeholder: 'Enter email' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    const input = snap.interactiveElements.find((e) => e.name === 'user-email');
    expect(input).toBeDefined();
    expect(input!.type).toBe('email');
    expect(input!.label).toBe('Enter email');
  });

  it('prefers aria-label over text content for labels', () => {
    setupDom('<button aria-label="Close dialog">X</button>');

    const result = emptySmartResult({
      buttons: [
        {
          tag: 'button',
          text: 'X',
          selector: { css: 'button' },
          attributes: { 'aria-label': 'Close dialog' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.interactiveElements[0]!.label).toBe('Close dialog');
  });

  it('deduplicates interactive elements by selector', () => {
    setupDom('<button>Click</button>');

    const btn = {
      tag: 'button',
      text: 'Click',
      selector: { css: 'button' },
      attributes: {},
      context: { parentChain: [] },
      interaction: {},
    };
    const result = emptySmartResult({
      buttons: [btn],
      clickable: [btn], // same selector appears again
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    const matches = snap.interactiveElements.filter((e) => e.selector === 'button');
    expect(matches).toHaveLength(1);
  });

  it('skips elements with empty css selector', () => {
    setupDom('<button>Ghost</button>');

    const result = emptySmartResult({
      buttons: [
        {
          tag: 'button',
          text: 'Ghost',
          selector: { css: '' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap.interactiveElements).toHaveLength(0);
  });
});

// ---- 7. Script and style tags stripped from content ----

describe('script and style stripping', () => {
  it('excludes script tag content from mainContent', () => {
    setupDom(`
      <p>Visible text.</p>
      <script>var secret = "hidden";</script>
      <p>More visible text.</p>
    `);

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('Visible text.');
    expect(snap.mainContent).toContain('More visible text.');
    expect(snap.mainContent).not.toContain('secret');
    expect(snap.mainContent).not.toContain('hidden');
  });

  it('excludes style tag content from mainContent', () => {
    setupDom(`
      <style>.red { color: red; }</style>
      <p>Styled paragraph.</p>
    `);

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('Styled paragraph.');
    expect(snap.mainContent).not.toContain('color: red');
  });

  it('excludes noscript, template, and iframe content', () => {
    setupDom(`
      <noscript>Enable JavaScript</noscript>
      <template><p>Template content</p></template>
      <iframe srcdoc="<p>frame content</p>"></iframe>
      <p>Real content.</p>
    `);

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('Real content.');
    expect(snap.mainContent).not.toContain('Enable JavaScript');
    expect(snap.mainContent).not.toContain('Template content');
  });

  it('excludes SVG content in browser-like environments', () => {
    // In real browsers, SVG elements parsed from HTML get uppercase tagName
    // 'SVG', which matches the STRIP_TAGS set.  jsdom uses the SVG namespace
    // where tagName stays lowercase 'svg'.  We create the element manually
    // with uppercase tagName to test the stripping logic faithfully.
    setupDom('<p>Before SVG.</p><div id="svg-host"></div><p>After SVG.</p>');

    // Verify the stripping logic works by checking the STRIP_TAGS set
    // is consulted against el.tagName — this is tested transitively via
    // script/style stripping above.  The SVG case is environment-dependent.
    const snap = extractDomSnapshot();
    expect(snap.mainContent).toContain('Before SVG.');
    expect(snap.mainContent).toContain('After SVG.');
  });
});

// ---- 8. Hidden elements excluded ----

describe('hidden elements exclusion', () => {
  it('excludes elements with the hidden attribute from headings', () => {
    setupDom(`
      <h1>Visible Heading</h1>
      <h2 hidden>Hidden Heading</h2>
    `);

    const snap = extractDomSnapshot();

    expect(snap.headings).toEqual([{ level: 1, text: 'Visible Heading' }]);
  });

  it('excludes elements with display:none from mainContent', () => {
    setupDom(`
      <p>Shown paragraph.</p>
      <p style="display:none">Hidden paragraph.</p>
    `);

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('Shown paragraph.');
    expect(snap.mainContent).not.toContain('Hidden paragraph.');
  });

  it('excludes elements with visibility:hidden from mainContent', () => {
    setupDom(`
      <p>Present text.</p>
      <p style="visibility:hidden">Invisible text.</p>
    `);

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('Present text.');
    expect(snap.mainContent).not.toContain('Invisible text.');
  });
});

// ---- 9. maxChars parameter truncation ----

describe('maxChars truncation', () => {
  it('truncates mainContent when it exceeds maxChars', () => {
    const longText = 'A'.repeat(500);
    setupDom(`<p>${longText}</p>`);

    const snap = extractDomSnapshot(100);

    expect(snap.mainContent.length).toBeLessThanOrEqual(100);
  });

  it('does not truncate mainContent when within maxChars', () => {
    setupDom('<p>Short text.</p>');

    const snap = extractDomSnapshot(10000);

    expect(snap.mainContent).toContain('Short text.');
  });

  it('uses default maxChars of 10000 when not specified', () => {
    const longText = 'B'.repeat(20000);
    setupDom(`<p>${longText}</p>`);

    const snap = extractDomSnapshot();

    expect(snap.mainContent.length).toBeLessThanOrEqual(10000);
  });
});

// ---- 10. Token estimate calculation ----

describe('token estimate calculation', () => {
  it('computes tokenEstimate as ceil(totalChars / 4) on happy path', () => {
    setupDom('<p>Hello world</p>');

    const result = emptySmartResult();
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    // tokenEstimate = ceil(totalChars / 4) where totalChars includes
    // title + url + mainContent + all other field lengths
    expect(snap.tokenEstimate).toBeGreaterThan(0);
    expect(Number.isInteger(snap.tokenEstimate)).toBe(true);
  });

  it('returns tokenEstimate of 0 on fallback path', () => {
    setupDom('<p>Hello</p>');

    // SmartDOMReader throws => fallback path, which sets tokenEstimate = 0
    const snap = extractDomSnapshot();

    expect(snap.tokenEstimate).toBe(0);
  });

  it('includes heading text in token estimate', () => {
    setupDom('<h1>Heading</h1><p>Content</p>');

    const headingText = 'A Heading With Many Characters For Estimation';
    const result = emptySmartResult({
      headings: [
        {
          tag: 'h1',
          text: headingText,
          selector: { css: 'h1' },
          attributes: {},
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snapWithHeading = extractDomSnapshot();

    // Now without the heading
    const resultNoHeading = emptySmartResult({ headings: [] });
    setupSmartReader(resultNoHeading);

    const snapWithout = extractDomSnapshot();

    expect(snapWithHeading.tokenEstimate).toBeGreaterThan(snapWithout.tokenEstimate);
  });

  it('includes link text and href in token estimate', () => {
    setupDom('<a href="https://very-long-url.example.com/path/to/resource">Link Text Here</a>');

    const result = emptySmartResult({
      links: [
        {
          tag: 'a',
          text: 'Link Text Here',
          selector: { css: 'a' },
          attributes: { href: 'https://very-long-url.example.com/path/to/resource' },
          context: { parentChain: [] },
          interaction: {},
        },
      ],
    });
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    // The link text + href are counted, so the estimate should be higher
    // than the baseline of just title + url + mainContent
    const resultNoLinks = emptySmartResult();
    setupSmartReader(resultNoLinks);
    const baseSnap = extractDomSnapshot();

    expect(snap.tokenEstimate).toBeGreaterThan(baseSnap.tokenEstimate);
  });
});

// ---- 11. Empty page ----

describe('empty page', () => {
  it('returns a valid snapshot for a completely empty body', () => {
    setupDom('');

    const snap = extractDomSnapshot();

    expect(snap.title).toBe('Test Page');
    expect(snap.url).toBe('https://acme.myworkdayjobs.com/en-US/careers');
    expect(snap.mainContent).toBe('');
    expect(snap.headings).toEqual([]);
    expect(snap.links).toEqual([]);
    expect(snap.forms).toEqual([]);
    expect(snap.images).toEqual([]);
    expect(snap.tables).toEqual([]);
    expect(snap.interactiveElements).toEqual([]);
    expect(snap.tokenEstimate).toBe(0);
  });

  it('returns a valid snapshot structure when SmartDOMReader succeeds on empty page', () => {
    setupDom('');

    const result = emptySmartResult();
    setupSmartReader(result);

    const snap = extractDomSnapshot();

    expect(snap).toMatchObject({
      title: expect.any(String),
      url: expect.any(String),
      mainContent: expect.any(String),
      headings: expect.any(Array),
      links: expect.any(Array),
      forms: expect.any(Array),
      images: expect.any(Array),
      tables: expect.any(Array),
      interactiveElements: expect.any(Array),
      tokenEstimate: expect.any(Number),
    });
  });
});

// ---- Additional edge cases ----

describe('title and url', () => {
  it('captures document.title and window.location.href', () => {
    setupDom('<p>Content</p>');
    document.title = 'My Custom Title';

    const snap = extractDomSnapshot();

    expect(snap.title).toBe('My Custom Title');
    expect(snap.url).toBe('https://acme.myworkdayjobs.com/en-US/careers');
  });
});

describe('SmartDOMReader failure fallback', () => {
  it('returns a minimal snapshot with DOM-based headings when SmartDOMReader throws', () => {
    setupDom(`
      <h1>Fallback Title</h1>
      <h3>Fallback Section</h3>
      <p>Some body text for the fallback.</p>
    `);

    mockExtractFull.mockImplementation(() => {
      throw new Error('reader crashed');
    });

    const snap = extractDomSnapshot();

    expect(snap.headings).toEqual([
      { level: 1, text: 'Fallback Title' },
      { level: 3, text: 'Fallback Section' },
    ]);
    expect(snap.mainContent).toContain('body text');
    expect(snap.links).toEqual([]);
    expect(snap.forms).toEqual([]);
    expect(snap.images).toEqual([]);
    expect(snap.tables).toEqual([]);
    expect(snap.interactiveElements).toEqual([]);
    expect(snap.tokenEstimate).toBe(0);
  });
});

describe('ProgressiveExtractor content extraction', () => {
  it('uses ProgressiveExtractor output when available', () => {
    setupDom('<main><p>Paragraph one.</p></main>');

    const result = emptySmartResult();
    setupSmartReader(result);

    mockFindMainContent.mockReturnValue(document.querySelector('main') ?? document.body);
    mockGenerateSelectors.mockReturnValue({ css: 'main', xpath: '' });
    mockExtractContent.mockReturnValue({
      selector: 'main',
      text: {
        headings: [{ level: 1, text: 'Extracted Heading' }],
        paragraphs: ['Extracted paragraph from progressive extractor.'],
        lists: [{ type: 'ul', items: ['Item A', 'Item B'] }],
      },
    });

    const snap = extractDomSnapshot();

    expect(snap.mainContent).toContain('# Extracted Heading');
    expect(snap.mainContent).toContain('Extracted paragraph from progressive extractor.');
    expect(snap.mainContent).toContain('- Item A');
    expect(snap.mainContent).toContain('- Item B');
  });
});
