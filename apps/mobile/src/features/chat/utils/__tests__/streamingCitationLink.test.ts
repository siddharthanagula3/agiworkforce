import { holdStreamingCitationLink } from '../streamingCitationLink';

const SOURCES = [
  { url: 'https://pubmed.ncbi.nlm.nih.gov/43019434/' },
  { url: 'https://science.nasa.gov/missions/webb/' },
];
const LEAD = 'Ice was found.\n\nThe study is new. ';

describe('holding a citation link that is still arriving', () => {
  it('holds a link whose label could still be a citation until its address closes', () => {
    expect(holdStreamingCitationLink(`${LEAD}[`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}[pubmed.ncbi`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}[pubmed.ncbi.nlm.nih.gov]`, SOURCES)).toBe(LEAD);
    expect(
      holdStreamingCitationLink(`${LEAD}[pubmed.ncbi.nlm.nih.gov](https://pubmed.nc`, SOURCES),
    ).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}[1`, SOURCES)).toBe(LEAD);
  });

  it('holds the parenthesis and a closed citation link until the next character arrives', () => {
    const link = '([science.nasa.gov](https://science.nasa.gov/missions/webb/)';
    expect(holdStreamingCitationLink(`${LEAD}(`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}([science.nasa.gov](https://sci`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}${link}`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}${link} `, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}${link})`, SOURCES)).toBe(`${LEAD}${link})`);
    expect(holdStreamingCitationLink(`${LEAD}${link},`, SOURCES)).toBe(`${LEAD}${link},`);
  });

  it('keeps the parenthesis that wraps two citation links once the first is followed', () => {
    const first = '([pubmed.ncbi.nlm.nih.gov](https://pubmed.ncbi.nlm.nih.gov/43019434/)';
    const second = '[science.nasa.gov](https://science.nasa.gov/missions/webb/)';
    expect(holdStreamingCitationLink(`${LEAD}${first}`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}${first}, [sci`, SOURCES)).toBe(`${LEAD}${first}, `);
    expect(holdStreamingCitationLink(`${LEAD}${first}, ${second}`, SOURCES)).toBe(
      `${LEAD}${first}, ${second}`,
    );
  });

  it('holds a marker written as a link from its outer bracket', () => {
    const url = 'https://pubmed.ncbi.nlm.nih.gov/43019434/';
    expect(holdStreamingCitationLink(`${LEAD}[[`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}[[1]`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}[[1]](https://pub`, SOURCES)).toBe(LEAD);
    expect(holdStreamingCitationLink(`${LEAD}([[1]](${url})`, SOURCES)).toBe(LEAD);
    const closed = `${LEAD}[[1]](${url})`;
    expect(holdStreamingCitationLink(closed, SOURCES)).toBe(closed);
    const escaped = `${LEAD}\\[[1`;
    expect(holdStreamingCitationLink(escaped, SOURCES)).toBe(`${LEAD}\\[`);
  });

  it('keeps a parenthesis around a closed link to a page that is not a source', () => {
    const other = `${LEAD}([example.org](https://example.org/a)`;
    expect(holdStreamingCitationLink(other, SOURCES)).toBe(other);
  });

  it('waits for the closing parenthesis of an address that has its own parentheses', () => {
    expect(
      holdStreamingCitationLink(`${LEAD}[en.wikipedia.org](https://en.wikipedia.org/wiki/A_(b)`, [
        { url: 'https://en.wikipedia.org/wiki/A_(b)' },
      ]),
    ).toBe(LEAD);
  });

  it('shows a label with words of its own as it arrives', () => {
    const words = `${LEAD}See [the full study](https://pubmed.ncbi`;
    expect(holdStreamingCitationLink(words, SOURCES)).toBe(words);
  });

  it('leaves code, closed links and answers without sources alone', () => {
    const fenced = 'Run this:\n\n```js\nconst first = rows[';
    expect(holdStreamingCitationLink(fenced, SOURCES)).toBe(fenced);
    const span = `${LEAD}Use \`rows[`;
    expect(holdStreamingCitationLink(span, SOURCES)).toBe(span);
    const image = `${LEAD}![chart`;
    expect(holdStreamingCitationLink(image, SOURCES)).toBe(image);
    const after = `${LEAD}[nasa](https://science.nasa.gov/missions/webb/) says`;
    expect(holdStreamingCitationLink(after, SOURCES)).toBe(after);
    expect(holdStreamingCitationLink(`${LEAD}[pubmed`, [])).toBe(`${LEAD}[pubmed`);
  });
});
