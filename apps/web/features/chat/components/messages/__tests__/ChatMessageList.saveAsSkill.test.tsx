import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '@agiworkforce/unified-chat';

vi.mock('@/features/skills/services/skills-catalog', () => ({
  SkillsCatalogError: class SkillsCatalogError extends Error {},
  invalidateSkillsCatalog: vi.fn(),
  loadSkillsCatalog: vi.fn(async () => []),
  skillAuthoringCapability: () => true,
}));

import { SAVE_AS_SKILL_PROMPT } from '@/features/skills/components/save-as-skill';
import { ChatMessageList } from '../ChatMessageList';

const transcript = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Write the weekly report.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Here is the weekly report, formatted the way you asked.',
    createdAt: new Date().toISOString(),
  },
] as unknown as ChatMessage[];

describe('Save as skill from the transcript', () => {
  it('sends the request as the next turn rather than filling the composer', async () => {
    const onSubmitPrompt = vi.fn();
    const onSendMessage = vi.fn();
    render(
      <ChatMessageList
        messages={transcript}
        onRegenerate={vi.fn()}
        onSendMessage={onSendMessage}
        onSubmitPrompt={onSubmitPrompt}
      />,
    );

    const menus = await screen.findAllByRole('button', { name: 'More message actions' });
    await userEvent.click(menus[menus.length - 1]!);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Save as skill' }));

    await waitFor(() => expect(onSubmitPrompt).toHaveBeenCalledWith(SAVE_AS_SKILL_PROMPT));
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
