import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConversationTitleMenu } from '../ConversationTitleMenu';
import { PRODUCT_NAMES } from '@agiworkforce/types';

afterEach(cleanup);

function renderMenu(agiWork: boolean) {
  render(
    <ConversationTitleMenu
      title="Pricing research"
      agiWork={agiWork}
      projects={[]}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

// ChatGPT tags a Work task inline in the header as "<title> · Work"; that suffix
// is the only thing telling a task apart from a chat on the shared chat route.
describe(`conversation title ${PRODUCT_NAMES.work} badge`, () => {
  it(`suffixes the title of a task started in ${PRODUCT_NAMES.work}`, () => {
    renderMenu(true);

    expect(screen.getByRole('button', { name: 'Conversation options' }).textContent).toBe(
      `Pricing research · ${PRODUCT_NAMES.work}`,
    );
  });

  it('leaves an ordinary chat title alone', () => {
    renderMenu(false);

    expect(screen.getByRole('button', { name: 'Conversation options' }).textContent).toBe(
      'Pricing research',
    );
  });
});
