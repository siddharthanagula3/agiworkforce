import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportAbstentionCard } from '../components/SupportAbstentionCard';
import { SupportAnswerCard } from '../components/SupportAnswerCard';
import { normalizeAnswer } from '../lib/normalize-answer';
import { renderSupportText } from '../lib/render-text';
import type { SupportAbstentionView, SupportAnswerView } from '../lib/contract';

/**
 * Assertions use roles, text and `data-support-*` attributes, never CSS-module
 * class names — vitest.config.ts runs with `css: false`, so class names are not
 * real in this environment and an assertion on one would be theatre.
 */

const RAW_ANSWER = {
  kind: 'answer',
  text: 'Open Settings → Providers and paste your Anthropic key.',
  citations: [
    { id: 'byok-1', title: 'Bring your own key', url: '/byok' },
    { id: 'docs-1', title: 'Provider environment variables', url: '/docs/byok-env' },
  ],
};

function renderReply(raw: unknown) {
  const reply = normalizeAnswer(raw);
  if (reply.kind === 'answer') {
    return render(<SupportAnswerCard answer={reply} />);
  }
  return render(<SupportAbstentionCard abstention={reply} />);
}

describe('an answer renders as an answer, with real links', () => {
  it('marks itself as an answer and renders one link per citation', () => {
    const { container } = renderReply(RAW_ANSWER);

    expect(container.querySelector('[data-support-message="answer"]')).not.toBeNull();
    expect(container.querySelector('[data-support-message="abstention"]')).toBeNull();
    expect(screen.getByText(/paste your Anthropic key/i)).toBeInTheDocument();

    const byok = screen.getByRole('link', { name: 'Bring your own key' });
    expect(byok).toHaveAttribute('href', '/byok');
    const env = screen.getByRole('link', { name: 'Provider environment variables' });
    expect(env).toHaveAttribute('href', '/docs/byok-env');
  });

  it('opens external citations in a new tab with a screen-reader hint and rel guards', () => {
    renderReply({
      ...RAW_ANSWER,
      citations: [{ id: 'x', title: 'Status page', url: 'https://status.example.com' }],
    });
    const link = screen.getByRole('link', { name: /Status page/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName('Status page (opens in a new tab)');
  });
});

describe('the SAME payload without citations renders as an abstention', () => {
  it('swaps structure, heading and data attribute — and shows no answer body', () => {
    const { container } = renderReply({ ...RAW_ANSWER, citations: [] });

    expect(container.querySelector('[data-support-message="abstention"]')).not.toBeNull();
    expect(container.querySelector('[data-support-message="answer"]')).toBeNull();
    // The confident prose is gone, not merely restyled.
    expect(screen.queryByText(/paste your Anthropic key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/don't have a source/i)).toBeInTheDocument();
    expect(container.querySelector('[data-support-abstention-reason="no_source"]')).not.toBeNull();
  });

  it('names the category for a hard-abstain and links the authoritative controls', () => {
    renderReply({
      kind: 'abstention',
      reason: 'hard_abstain_billing',
      text: 'Charges and refunds are handled by a person.',
      authoritativeLinks: [{ title: 'Refund policy', url: '/refund-policy' }],
    });

    expect(screen.getByText(/Billing — a person handles this/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute(
      'href',
      '/refund-policy',
    );
  });

  it('offers a human when an escalation handler is supplied', () => {
    const abstention: SupportAbstentionView = {
      kind: 'abstention',
      reason: 'no_relevant_source',
      text: 'No source.',
      citations: [],
      escalationOffered: true,
    };
    render(<SupportAbstentionCard abstention={abstention} onEscalate={() => undefined} />);
    expect(screen.getByRole('button', { name: /send this to a person/i })).toBeInTheDocument();
  });
});

describe('answer prose is never turned into a link', () => {
  it('renders a URL in the body as plain text, with no anchor', () => {
    const answer: SupportAnswerView = {
      kind: 'answer',
      // An injected document could put this in the model's mouth.
      text: 'Visit https://evil.example/reset to fix it.',
      citations: [{ id: 'c', title: 'Real doc', url: '/help' }],
      proposedActionId: null,
    };
    const { container } = render(<SupportAnswerCard answer={answer} />);

    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/help');
    expect(screen.getByText(/evil\.example/)).toBeInTheDocument();
  });

  it('renderSupportText emits no anchors at all', () => {
    const { container } = render(<div>{renderSupportText('see http://a.example and /b')}</div>);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('SupportAnswerCard refuses to render an uncited answer even if handed one', () => {
  it('renders nothing rather than an unsourced claim', () => {
    // Bypasses normalizeAnswer on purpose: this is the runtime backstop.
    const forged = {
      kind: 'answer',
      text: 'Trust me.',
      citations: [],
      proposedActionId: null,
    } as SupportAnswerView;
    const { container } = render(<SupportAnswerCard answer={forged} />);
    expect(container.textContent).toBe('');
  });
});
