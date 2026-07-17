import { describe, expect, it } from 'vitest';

import { classifyDeveloperTurn } from '../integrations/routingTask';

describe('classifyDeveloperTurn', () => {
  it('classifies each outgoing developer turn instead of pinning Auto to coding', () => {
    expect(classifyDeveloperTurn('Search the web for the latest Rust release')).toBe('research');
    expect(classifyDeveloperTurn('Fix this TypeError in the function')).toBe('coding');
  });

  it('includes image inputs in task classification', () => {
    expect(
      classifyDeveloperTurn('What is wrong here?', [
        { type: 'image', image_url: 'data:image/png;base64,AQID' },
      ]),
    ).toBe('multimodal');
  });
});
