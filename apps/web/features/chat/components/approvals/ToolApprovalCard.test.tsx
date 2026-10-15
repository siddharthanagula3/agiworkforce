import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolApprovalCard } from './ToolApprovalCard';

function renderCard(overrides: Partial<Parameters<typeof ToolApprovalCard>[0]> = {}) {
  const onDecide = vi.fn();
  render(
    <ToolApprovalCard
      toolCallId="call_1"
      label="GitHub · Create Issue"
      parameters={{ repo: 'agi/web', title: 'Ship it', labels: ['bug'] }}
      review={{ riskTier: 'medium', destructive: false, scopes: ['once', 'session', 'always'] }}
      decided={false}
      onDecide={onDecide}
      {...overrides}
    />,
  );
  return { onDecide, decisions: within(screen.getByRole('group', { name: /decision for/i })) };
}

describe('ToolApprovalCard', () => {
  it('shows each parameter formatted, the raw JSON behind a disclosure, and the risk', () => {
    renderCard();
    expect(screen.getByText('repo')).toBeInTheDocument();
    expect(screen.getByText('agi/web')).toBeInTheDocument();
    expect(screen.getByText('["bug"]')).toBeInTheDocument();
    expect(screen.getByText('Medium risk')).toBeInTheDocument();
    const raw = screen.getByText('Raw JSON').closest('details');
    expect(raw).not.toHaveAttribute('open');
    expect(raw?.querySelector('pre')?.textContent).toContain('"title": "Ship it"');
  });

  it.each([
    ['Allow once', 'approved'],
    ['Allow for this chat', 'approved-for-session'],
    ['Always allow', 'approved-always'],
    ['Deny', 'rejected'],
  ])('%s sends the %s decision for the exact call', (label, decision) => {
    const { onDecide, decisions } = renderCard();
    fireEvent.click(decisions.getByRole('button', { name: label }));
    expect(onDecide).toHaveBeenCalledWith('call_1', decision);
  });

  it('offers only the scopes the server reviewed', () => {
    const { decisions } = renderCard({
      review: { riskTier: 'low', destructive: false, scopes: ['once'] },
    });
    expect(decisions.queryByRole('button', { name: 'Allow for this chat' })).toBeNull();
    expect(decisions.queryByRole('button', { name: 'Always allow' })).toBeNull();
    expect(decisions.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
  });

  it('asks before allowing a destructive tool for the chat, naming what cannot be undone', () => {
    const { onDecide, decisions } = renderCard({
      review: { riskTier: 'critical', destructive: true, scopes: ['once', 'session'] },
    });
    expect(decisions.queryByRole('button', { name: 'Always allow' })).toBeNull();
    fireEvent.click(decisions.getByRole('button', { name: 'Allow for this chat' }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/cannot be recovered/);
    expect(dialog).toHaveTextContent(/until this chat is deleted/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow for this chat' }));
    expect(onDecide).toHaveBeenCalledWith('call_1', 'approved-for-session');
  });

  it('asks before always allowing a high-risk tool, naming the tool, the connector and the consequence', () => {
    const { onDecide, decisions } = renderCard({
      connectorName: 'Custom connector',
      toolLabel: 'Do Thing',
      review: { riskTier: 'high', destructive: true, scopes: ['once', 'session', 'always'] },
    });
    fireEvent.click(decisions.getByRole('button', { name: 'Always allow' }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Do Thing on Custom connector will run without asking, including writes that cannot be undone.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Always allow' }));
    expect(onDecide).toHaveBeenCalledWith('call_1', 'approved-always');
  });

  it('never offers Always allow for a critical tool', () => {
    const { decisions } = renderCard({
      review: { riskTier: 'critical', destructive: true, scopes: ['once', 'session'] },
    });
    expect(screen.getByText('Critical risk')).toBeInTheDocument();
    expect(decisions.queryByRole('button', { name: 'Always allow' })).toBeNull();
  });

  it('falls back to a single reviewed call when the review is missing', () => {
    const { decisions } = renderCard({ review: undefined });
    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(decisions.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Allow once',
      'Deny',
    ]);
  });

  it('disables every decision once one is recorded', () => {
    const { decisions } = renderCard({ decided: true });
    for (const button of decisions.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
