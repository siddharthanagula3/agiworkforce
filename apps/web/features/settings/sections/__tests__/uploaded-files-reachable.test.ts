import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const privacy = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);

// claude.ai Privacy lists four Manage entries. Ours had three: the Library that
// lists uploaded and generated media existed and was in the nav, but the one
// screen a privacy-minded user opens never pointed at it.
describe('Privacy points at every surface holding the user data it describes', () => {
  it('links uploaded files to the Library', () => {
    expect(privacy).toContain('Uploaded files');
    expect(privacy).toContain('/chat/library');
  });

  it('still links the other data surfaces', () => {
    for (const target of ['shared-links', 'archived', 'deleted-chats', 'memory']) {
      expect(privacy, `missing link to ${target}`).toContain(`section="${target}"`);
    }
    expect(privacy).toContain('/privacy/requests');
  });

  it('links to a Library that actually exists', () => {
    // A Manage row pointing at a 404 is worse than no row.
    expect(existsSync(join(process.cwd(), 'app/chat/library'))).toBe(true);
  });

  it('links to a delete path, not just a listing', () => {
    const view = readFileSync(
      join(process.cwd(), 'features/library/components/LibraryView.tsx'),
      'utf8',
    );
    expect(view).toContain('deleteItem');
    expect(view).toContain('permanentlyDeleteItem');
  });
});
