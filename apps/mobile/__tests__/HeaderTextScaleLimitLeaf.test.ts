import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@/stores/chatStore', () => ({ useChatStore: jest.fn() }));
jest.mock('@/src/features/billing/store', () => ({ useTierStore: jest.fn() }));

import { HEADER_TEXT_SCALE_LIMIT as fromSwitch } from '../src/features/chat/components/WorkModeSwitch';
import { HEADER_TEXT_SCALE_LIMIT as fromTokens } from '../src/ui/theme/tokens';

const TOKENS_SOURCE = readFileSync(join(__dirname, '../src/ui/theme/tokens.ts'), 'utf8');

describe('the header text cap lives in a leaf module', () => {
  it('keeps the theme tokens free of store and screen imports', () => {
    const imports = TOKENS_SOURCE.match(/from '[^']+'/g) ?? [];

    expect(imports).toEqual(["from '@agiworkforce/design-tokens'"]);
  });

  it('is still exported from the work mode switch with the same value', () => {
    expect(fromTokens).toBe(2);
    expect(fromSwitch).toBe(fromTokens);
  });
});
