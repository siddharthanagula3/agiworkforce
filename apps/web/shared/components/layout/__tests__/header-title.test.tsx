import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationTitleMenu } from '@/features/chat/components/ConversationTitleMenu';

const LONG_TITLE =
  'Quarterly planning for the platform migration, the billing rewrite, the mobile release train and the support backlog review';

function classesOf(element: Element | null): string[] {
  return element?.getAttribute('class')?.split(/\s+/) ?? [];
}

describe('the chat header title', () => {
  it('ends in an ellipsis inside the space it is given rather than pushing the controls off the row', () => {
    render(
      <ConversationTitleMenu
        title={LONG_TITLE}
        projects={[]}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const text = screen.getByText(LONG_TITLE);
    const trigger = text.closest('button');
    const slot = trigger?.parentElement ?? null;

    expect(text.textContent).toBe(LONG_TITLE);
    expect(classesOf(text)).toContain('truncate');
    expect(classesOf(trigger)).toContain('min-w-0');
    expect(classesOf(slot)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
  });
});
