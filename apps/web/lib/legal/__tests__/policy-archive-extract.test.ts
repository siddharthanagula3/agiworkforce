import { describe, expect, it } from 'vitest';

import { extract, plain } from '../../../../../scripts/lib/policy-archive-extract.mjs';

function blocksOf(html: string) {
  const main = document.createElement('main');
  main.innerHTML = html;
  return extract(main);
}

describe('policy archive extractor', () => {
  it('keeps the label of a button that opens a sentence, as plain text with no control', () => {
    expect(
      blocksOf(
        `<p class="agi-ds-prose">
          <button type="button" class="underline underline-offset-2">Change your cookie preferences</button>
          at any time: analytics stays off until you turn it on. For data export or deletion, see the
          <a href="/privacy" class="agi-ds-link">privacy policy</a>.
        </p>`,
      ),
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            text: 'Change your cookie preferences at any time: analytics stays off until you turn it on. For data export or deletion, see the ',
          },
          { text: 'privacy policy', href: '/privacy' },
          { text: '.' },
        ],
      },
    ]);
  });

  it('keeps a button label in the middle of a sentence, a list item and a table cell without a link target', () => {
    const blocks = blocksOf(
      `<p>Open <a href="/settings"><button type="button">your settings</button></a> to switch it off.</p>
       <ul><li>Press <button type="button">Reject all</button> to refuse analytics.</li></ul>
       <table>
         <tr><th>Control</th><th>Effect</th></tr>
         <tr><td>Use <button type="button">Withdraw</button> here.</td><td>Stops loading.</td></tr>
       </table>`,
    );

    expect(blocks).toEqual([
      { type: 'paragraph', content: [{ text: 'Open your settings to switch it off.' }] },
      { type: 'list', items: [[{ text: 'Press Reject all to refuse analytics.' }]] },
      {
        type: 'table',
        header: ['Control', 'Effect'],
        rows: [[[{ text: 'Use Withdraw here.' }], [{ text: 'Stops loading.' }]]],
      },
    ]);
  });

  it('turns a row of link buttons into a list that keeps every label and target', () => {
    expect(
      blocksOf(
        `<section id="related">
          <div class="agi-ds-stack">
            <h2 class="agi-ds-h2" id="agi-trust-more-title">Go deeper on any of it.</h2>
            <div class="agi-ds-btn-row">
              <a class="agi-ds-btn" data-variant="primary" href="/security">Security mechanisms</a>
              <a class="agi-ds-btn" data-variant="secondary" href="/status">Live status</a>
              <a class="agi-ds-btn" data-variant="secondary" href="/dpa">
                Data processing <strong>addendum</strong>
              </a>
            </div>
          </div>
        </section>`,
      ),
    ).toEqual([
      {
        type: 'heading',
        level: 2,
        anchor: 'related',
        content: [{ text: 'Go deeper on any of it.' }],
      },
      {
        type: 'list',
        items: [
          [{ text: 'Security mechanisms', href: '/security' }],
          [{ text: 'Live status', href: '/status' }],
          [{ text: 'Data processing addendum', href: '/dpa' }],
        ],
      },
    ]);
  });

  it('keeps a link row that is the only thing inside its wrapper', () => {
    expect(
      blocksOf(
        `<h2>Related.</h2>
         <div class="wrapper">
           <div class="agi-ds-btn-row"><a class="agi-ds-btn" href="/privacy">Privacy</a></div>
         </div>`,
      ),
    ).toEqual([
      { type: 'heading', level: 2, content: [{ text: 'Related.' }] },
      { type: 'list', items: [[{ text: 'Privacy', href: '/privacy' }]] },
    ]);
  });

  it('keeps the calls to action in a page hero out, because the archive page has its own', () => {
    expect(
      blocksOf(
        `<section class="agi-ds-section agi-ds-hero" aria-labelledby="agi-trust-title">
          <div class="agi-ds-container">
            <div>
              <div class="agi-ds-stack">
                <div>
                  <span class="agi-ds-eyebrow">Trust</span>
                  <h1 class="agi-ds-h1" id="agi-trust-title">Claims with dates.</h1>
                </div>
                <p class="agi-ds-prose">A posture ledger, not a badge wall.</p>
                <div class="agi-ds-btn-row">
                  <a class="agi-ds-btn" href="/security">Read the mechanisms</a>
                  <a class="agi-ds-btn" data-variant="secondary" href="#verify">Verify us yourself</a>
                </div>
              </div>
            </div>
          </div>
        </section>`,
      ),
    ).toEqual([
      { type: 'eyebrow', content: [{ text: 'Trust' }] },
      {
        type: 'heading',
        level: 1,
        anchor: 'agi-trust-title',
        content: [{ text: 'Claims with dates.' }],
      },
      { type: 'paragraph', content: [{ text: 'A posture ledger, not a badge wall.' }] },
    ]);
  });

  it('leaves block-level buttons, forms, navigation and concealed content out', () => {
    const blocks = blocksOf(
      `<h2>Your choices.</h2>
       <button type="button">Accept all</button>
       <div><button type="button">Copy link</button></div>
       <p><button type="button">Subscribe</button></p>
       <ul><li><button type="button">Tab one</button></li></ul>
       <form><p>Email address</p><button type="submit">Join</button></form>
       <nav><p>On this page</p><a href="#s-01">Cookies we set</a></nav>
       <p aria-hidden="true">Decorative text</p>
       <p hidden>Collapsed text</p>
       <p>
         Analytics is opt-in.
         <button type="button" hidden>Hidden control</button>
         <button type="button" aria-hidden="true">Silent control</button>
         <button type="button" class="agi-ds-btn">Get started</button>
         <span aria-hidden="true">decoration</span>
       </p>
       <a class="agi-ds-btn" href="/signup">Start free</a>
       <div class="agi-ds-btn-row"><button type="button" class="agi-ds-btn">Open the app</button></div>
       <div class="agi-ds-btn-row" aria-hidden="true"><a class="agi-ds-btn" href="/hidden">Hidden</a></div>
       <div class="agi-ds-btn-row">
         <a class="agi-ds-btn" href="/shown">Shown</a>
         <span hidden><a class="agi-ds-btn" href="/concealed">Concealed</a></span>
         <a class="agi-ds-btn">No target</a>
       </div>`,
    );

    expect(blocks).toEqual([
      { type: 'heading', level: 2, content: [{ text: 'Your choices.' }] },
      { type: 'paragraph', content: [{ text: 'Analytics is opt-in.' }] },
      { type: 'list', items: [[{ text: 'Shown', href: '/shown' }]] },
    ]);
  });

  it('reads a block back as the sentence a visitor saw', () => {
    const [paragraph] = blocksOf(
      '<p><button type="button">Change your cookie preferences</button> at any time.</p>',
    );

    expect(plain(paragraph.content)).toBe('Change your cookie preferences at any time.');
  });
});
