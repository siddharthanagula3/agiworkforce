import { describe, expect, it } from 'vitest';

import { restoreHyphenatedLabels } from '../checklistLabels';

describe('checklist labels', () => {
  it('puts spaces back into slug labels and leaves spaced labels alone', () => {
    const source = [
      '- [ ] Verify-chat-rendering',
      '- [ ] Verify copy button',
      '- [ ] Verify-code-execution',
      '- [ ] Verify artifact editing',
    ].join('\n');

    expect(restoreHyphenatedLabels(source)).toBe(
      [
        '- [ ] Verify chat rendering',
        '- [ ] Verify copy button',
        '- [ ] Verify code execution',
        '- [ ] Verify artifact editing',
      ].join('\n'),
    );
  });

  it('repairs the same labels inside an HTML checklist', () => {
    const html = '<label>Verify-chat-rendering</label><label>Verify copy button</label>';
    expect(restoreHyphenatedLabels(html)).toBe(
      '<label>Verify chat rendering</label><label>Verify copy button</label>',
    );
  });
});
