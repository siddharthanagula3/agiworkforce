import { describe, expect, it } from 'vitest';

import { clientProvisionalTitle, plainTitleText, serverProvisionalTitle } from '../chat-title';

const PASTED_PROMPT =
  '# AGIWORKFORCE INLINE UI/UX RENDERING STRESS TEST\n\n## Objective\n\nI want to test the **actual** UI rendering of `AGIWorkforce`.';

describe('a provisional conversation title', () => {
  it('drops heading, quote, bold and code markers from a pasted Markdown prompt', () => {
    expect(plainTitleText(PASTED_PROMPT)).toBe(
      'AGIWORKFORCE INLINE UI/UX RENDERING STRESS TEST Objective I want to test the actual UI rendering of AGIWorkforce.',
    );
    expect(plainTitleText('> quoted line\nnext')).toBe('quoted line next');
  });

  it('keeps a hash that is part of the words', () => {
    expect(plainTitleText('C# tips for issue #42')).toBe('C# tips for issue #42');
  });

  it('cuts the server title at 50 characters with an ellipsis and the client title at 60', () => {
    expect(serverProvisionalTitle(PASTED_PROMPT)).toBe(
      'AGIWORKFORCE INLINE UI/UX RENDERING STRESS TEST Ob...',
    );
    expect(clientProvisionalTitle(PASTED_PROMPT)).toHaveLength(60);
    expect(serverProvisionalTitle('write an email')).toBe('write an email');
  });
});
