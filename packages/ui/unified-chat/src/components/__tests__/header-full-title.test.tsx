/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeProjectHeader } from '@agiworkforce/types';
import { ConversationHeader } from '../ConversationHeader';
import { ProjectHeader } from '../ProjectHeader';
import { useChatStore } from '../../stores/chatStore';

const LONG_TITLE =
  'Quarterly planning for the platform migration, the billing rewrite, the mobile release train and the support backlog review';

function seedConversation(title: string) {
  useChatStore.setState({
    activeConversationId: 'c1',
    conversations: [{ id: 'c1', title, messages: [], createdAt: 0, updatedAt: 0 }],
  } as never);
}

function expectTruncatedWithFullTitle(heading: HTMLElement, full: string) {
  expect(heading.textContent).toBe(full);
  expect(heading.getAttribute('title')).toBe(full);
  expect(heading.className.split(/\s+/)).toContain('truncate');
}

describe('a header title that does not fit', () => {
  it('clips the conversation title with an ellipsis and keeps the whole of it on hover', () => {
    seedConversation(LONG_TITLE);
    render(<ConversationHeader />);
    const heading = screen.getByRole('heading', { level: 2 });
    expectTruncatedWithFullTitle(heading, LONG_TITLE);
    expect(heading.className.split(/\s+/)).toContain('min-w-0');
  });

  it('offers the fallback title on hover too, not an empty tooltip', () => {
    seedConversation('');
    render(<ConversationHeader />);
    expectTruncatedWithFullTitle(screen.getByRole('heading', { level: 2 }), 'New Conversation');
  });

  it('clips the project title with an ellipsis and keeps the whole of it on hover', () => {
    const presentation = summarizeProjectHeader({
      project: {
        id: 'proj_1',
        ownerUserId: 'user_1',
        name: LONG_TITLE,
        description: 'Planning notes.',
        defaultPrivacyMode: 'local',
        defaultProviderMode: 'Local',
        allowedSurfaces: ['web'],
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-20T00:00:00Z',
      },
    });
    render(<ProjectHeader presentation={presentation} />);
    expectTruncatedWithFullTitle(screen.getByRole('heading', { level: 2 }), LONG_TITLE);
  });
});
