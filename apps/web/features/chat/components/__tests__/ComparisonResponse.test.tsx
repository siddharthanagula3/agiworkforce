import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComparisonResponse } from '../messages/ComparisonResponse';

vi.mock('../messages/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <span data-testid="markdown-content">{content}</span>
  ),
}));

const OPTION_A = { label: 'Builder-focused', content: 'Build AGI quickly with Rust and Tauri.' };
const OPTION_B = { label: 'Vision-forward', content: 'Think big: multi-surface, agent-native.' };

describe('ComparisonResponse', () => {
  it('renders both options with labels', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByText('Builder-focused')).toBeInTheDocument();
    expect(screen.getByText('Vision-forward')).toBeInTheDocument();
    expect(screen.getByText(OPTION_A.content)).toBeInTheDocument();
    expect(screen.getByText(OPTION_B.content)).toBeInTheDocument();
  });

  it('renders Choose A and Choose B CTA buttons when no choice made', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByRole('button', { name: /choose option a/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose option b/i })).toBeInTheDocument();
  });

  it('calls onChoose with "a" when Choose A is clicked', () => {
    const onChoose = vi.fn();
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /choose option a/i }));
    expect(onChoose).toHaveBeenCalledWith('a');
  });

  it('calls onChoose with "b" when Choose B is clicked', () => {
    const onChoose = vi.fn();
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /choose option b/i }));
    expect(onChoose).toHaveBeenCalledWith('b');
  });

  it('hides CTA buttons once a choice is made', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.queryByRole('button', { name: /choose option a/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose option b/i })).not.toBeInTheDocument();
  });

  it('shows check icon on the chosen option when choice=a', () => {
    const { container } = render(
      <ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />,
    );
    const optionA = container.querySelector('[data-testid="comparison-option-a"]');
    expect(optionA).not.toBeNull();
    // Check icon has aria-label "Option A chosen"
    expect(screen.getByLabelText('Option A chosen')).toBeInTheDocument();
  });

  it('dims unchosen option when choice=b', () => {
    const { container } = render(
      <ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="b" />,
    );
    const optionA = container.querySelector('[data-testid="comparison-option-a"]');
    expect(optionA?.className).toMatch(/opacity-50/);
  });

  it('shows confirmation text after choice', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.getByText(/you chose option a/i)).toBeInTheDocument();
  });

  // Structural snapshots: verify exact rendered output for regression detection
  it('structural snapshot: unchosen state renders exactly two CTA buttons', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Choose option A', 'Choose option B']);
  });

  it('structural snapshot: choice=a state has no buttons, check mark, and confirmation text', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.queryAllByRole('button').length).toBe(0);
    expect(screen.getByLabelText('Option A chosen')).toBeInTheDocument();
    expect(screen.getByText(/you chose option a/i)).toBeInTheDocument();
  });

  it('structural snapshot: choice=b state shows correct confirmation message', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="b" />);
    expect(screen.getByText(/you chose option b/i).textContent).toBe(
      'You chose option B. The other response has been dimmed.',
    );
  });
});
