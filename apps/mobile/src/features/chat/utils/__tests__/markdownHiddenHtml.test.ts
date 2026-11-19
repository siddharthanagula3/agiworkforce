import { dropHiddenHtmlBlocks } from '../markdownHiddenHtml';

describe('hidden html blocks', () => {
  it('drops a multi-line script or style element and keeps text around it', () => {
    expect(dropHiddenHtmlBlocks('a\n<script type="x">\nbad()\n</script> tail\nb')).toBe(
      'a\n tail\nb',
    );
    expect(dropHiddenHtmlBlocks('head <style>\nx{}\n</style>')).toBe('head ');
  });

  it('drops the rest of the answer while a script element is still open', () => {
    expect(dropHiddenHtmlBlocks('a\n<script>\nbad(', true)).toBe('a');
  });

  it('keeps a script element that never closed once the answer is settled', () => {
    expect(dropHiddenHtmlBlocks('a\n<script>\nbad(')).toBe('a\n<script>\nbad(');
  });

  it('keeps an answer that names a style element in prose', () => {
    const answer = 'The <style> element holds CSS.\n\nSecond paragraph.\n\n- item one\n- item two';
    expect(dropHiddenHtmlBlocks(answer)).toBe(answer);
    expect(dropHiddenHtmlBlocks(answer, true)).toBe(answer);
  });

  it('keeps an answer whose prose names a script tag before a fence that closes one', () => {
    const answer =
      'Add a <script> tag at the end of the body:\n\n```html\n<body>\n  <script src="app.js"></script>\n</body>\n```\n\nThen reload the page.\n\n## Next step\nStyle it.';
    expect(dropHiddenHtmlBlocks(answer)).toBe(answer);
    expect(dropHiddenHtmlBlocks(answer, true)).toBe(answer);
  });

  it('never looks for the closing tag inside a later fence', () => {
    const answer = '<style>\nbody{}\n```css\n</style>\n```\nafter';
    expect(dropHiddenHtmlBlocks(answer)).toBe(answer);
    expect(dropHiddenHtmlBlocks(answer, true)).toBe(answer);
  });

  it('hides a real script block while streaming and once settled', () => {
    const answer = 'Before\n<script>\nsteal()\n</script>\nAfter\n\n```js\nkeep()\n```';
    expect(dropHiddenHtmlBlocks(answer)).toBe('Before\n\nAfter\n\n```js\nkeep()\n```');
    expect(dropHiddenHtmlBlocks(answer, true)).toBe('Before\n\nAfter\n\n```js\nkeep()\n```');
  });

  it('leaves a one-line element for the inline reader and keeps code that names the tag', () => {
    expect(dropHiddenHtmlBlocks('x <script>y()</script> z')).toBe('x <script>y()</script> z');
    expect(dropHiddenHtmlBlocks('use `<script>` here\nnext')).toBe('use `<script>` here\nnext');
    expect(dropHiddenHtmlBlocks('```html\n<script>\nok()\n```')).toBe(
      '```html\n<script>\nok()\n```',
    );
    expect(dropHiddenHtmlBlocks('    <script>\n    keep')).toBe('    <script>\n    keep');
  });

  it('leaves a blank line where an element that starts a line was, so the text around it is two paragraphs', () => {
    expect(dropHiddenHtmlBlocks('Before\n<script>\nbad()\n</script>\nAfter')).toBe(
      'Before\n\nAfter',
    );
    expect(dropHiddenHtmlBlocks('Before\n  <style>\nx{}\n</style>\nAfter')).toBe('Before\n\nAfter');
  });

  it('keeps the words around an element that opens mid-line in one paragraph', () => {
    expect(dropHiddenHtmlBlocks('Intro <script>\nbad()\n</script> outro')).toBe('Intro  outro');
  });

  it('drops an HTML comment block outside code and keeps text after its close', () => {
    expect(dropHiddenHtmlBlocks('<!-- deck -->\n# Title')).toBe('\n# Title');
    expect(dropHiddenHtmlBlocks('a\n<!-- one\ntwo -->\nb')).toBe('a\n\nb');
    expect(dropHiddenHtmlBlocks('<!-- x --> shown')).toBe(' shown');
    expect(dropHiddenHtmlBlocks('<!-->\nb')).toBe('\nb');
    expect(dropHiddenHtmlBlocks('a\n<!-- open\nrest')).toBe('a');
  });

  it('ends an unclosed comment at the next fence so the fence stays code', () => {
    expect(dropHiddenHtmlBlocks('<!-- note\n```html\n<!-- x -->\n```\nrest')).toBe(
      '```html\n<!-- x -->\n```\nrest',
    );
  });

  it('keeps a comment inside code or mid-line for the readers that own them', () => {
    expect(dropHiddenHtmlBlocks('```html\n<!-- keep -->\n```')).toBe('```html\n<!-- keep -->\n```');
    expect(dropHiddenHtmlBlocks('    <!-- keep -->')).toBe('    <!-- keep -->');
    expect(dropHiddenHtmlBlocks('text <!-- inline -->')).toBe('text <!-- inline -->');
  });
});
