import { describe, expect, it } from 'vitest';

import { fallbackWillRunScripts } from '../SandboxedIframe';

describe('whether the srcdoc fallback can run an artifact', () => {
  it('knows an inline script will be blocked', () => {
    // srcdoc inherits the app's CSP, which requires a nonce for inline script.
    // The artifact's own scripts have none, so the page renders and does
    // nothing - a convincing replica of a working tool.
    expect(fallbackWillRunScripts('<html><body><script>doThing()</script></body></html>')).toBe(
      false,
    );
    expect(
      fallbackWillRunScripts(
        '<html><body>\n<script type="module">\nlet a = 1;\n</script>\n</body></html>',
      ),
    ).toBe(false);
  });

  it('treats a document with no inline script as renderable', () => {
    expect(fallbackWillRunScripts('<html><body><h1>A chart</h1><svg></svg></body></html>')).toBe(
      true,
    );
  });

  it('does not flag an external script, which was never going to be inline', () => {
    expect(
      fallbackWillRunScripts(
        '<html><head><script src="https://cdn.example/x.js"></script></head></html>',
      ),
    ).toBe(true);
  });

  it('is not fooled by the word script in text', () => {
    expect(fallbackWillRunScripts('<p>Write a script for the play.</p>')).toBe(true);
  });
});
