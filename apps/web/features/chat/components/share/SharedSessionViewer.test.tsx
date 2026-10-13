import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getManagedModelPresentationLabel } from '@agiworkforce/unified-chat';
import { SkipLinks } from '@/shared/components/accessibility/SkipLinks';

import { SharedSessionViewer, type SharedSession } from './SharedSessionViewer';

const BASE_SESSION: SharedSession = {
  title: 'Shared chat',
  messages: [],
  total_messages: 0,
  expires_at: '2026-08-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
};

describe('SharedSessionViewer page landmark', () => {
  it('gives the shared transcript one main landmark targeted by the global skip link', () => {
    const { container } = render(
      <>
        <SkipLinks />
        <SharedSessionViewer
          session={{
            ...BASE_SESSION,
            messages: [
              { role: 'user', content: 'Summarize this plan.' },
              { role: 'assistant', content: 'The next step is ready.' },
            ],
            total_messages: 2,
          }}
          token="tok123"
        />
      </>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(container.querySelectorAll('#main-content')).toHaveLength(1);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      `#${main.id}`,
    );
    expect(within(main).getByRole('heading', { level: 1, name: BASE_SESSION.title })).toBeVisible();
    expect(within(main).getByText('Summarize this plan.')).toBeVisible();
    expect(within(main).getByText('The next step is ready.')).toBeVisible();
    expect(within(main).getByRole('link', { name: 'Open in AGI' })).toHaveAttribute(
      'href',
      '/chat/from-share/tok123',
    );
  });
});

describe('SharedSessionViewer attachments', () => {
  it('shows an explicit placeholder instead of silently dropping an attachment', () => {
    render(
      <SharedSessionViewer
        session={{
          ...BASE_SESSION,
          messages: [
            {
              role: 'user',
              content: 'here is the diagram',
              attachments: [{ name: 'diagram.png', type: 'image', mimeType: 'image/png' }],
            },
          ],
          total_messages: 1,
        }}
        token="tok123"
      />,
    );

    expect(screen.getByText(/diagram\.png/)).toBeVisible();
    expect(screen.getByText(/attachment omitted from shared snapshot/i)).toBeVisible();
    expect(screen.getByText('here is the diagram')).toBeVisible();
  });

  it('renders no attachment placeholder when a message has none', () => {
    render(
      <SharedSessionViewer
        session={{
          ...BASE_SESSION,
          messages: [{ role: 'assistant', content: 'no files here' }],
          total_messages: 1,
        }}
        token="tok123"
      />,
    );

    expect(screen.queryByText(/attachment omitted from shared snapshot/i)).toBeNull();
  });
});

describe('SharedSessionViewer model identity', () => {
  it('names the model through the shared ModelBadge', () => {
    const modelId = 'fixture-shared-model';
    const { container } = render(
      <SharedSessionViewer session={{ ...BASE_SESSION, model_id: modelId }} token="tok123" />,
    );

    const badge = container.querySelector('[data-model-badge]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe(getManagedModelPresentationLabel(modelId));
  });

  it('renders no model badge when the snapshot has no model', () => {
    const { container } = render(<SharedSessionViewer session={BASE_SESSION} token="tok123" />);

    expect(container.querySelector('[data-model-badge]')).toBeNull();
  });
});
