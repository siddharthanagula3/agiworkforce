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
  it('renders both tab buttons with labels', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByTestId('comparison-tab-a')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-tab-b')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-tab-a').textContent).toContain('Builder-focused');
    expect(screen.getByTestId('comparison-tab-b').textContent).toContain('Vision-forward');
  });

  it('shows option A content by default', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByText(OPTION_A.content)).toBeInTheDocument();
    expect(screen.queryByText(OPTION_B.content)).not.toBeInTheDocument();
  });

  it('switches to option B content when B tab is clicked', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    fireEvent.click(screen.getByTestId('comparison-tab-b'));
    expect(screen.getByText(OPTION_B.content)).toBeInTheDocument();
    expect(screen.queryByText(OPTION_A.content)).not.toBeInTheDocument();
  });

  it('renders a Choose CTA button for the active tab when no choice made', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByRole('button', { name: /choose option a/i })).toBeInTheDocument();
  });

  it('shows Choose B CTA when tab B is active', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    fireEvent.click(screen.getByTestId('comparison-tab-b'));
    expect(screen.getByRole('button', { name: /choose option b/i })).toBeInTheDocument();
  });

  it('calls onChoose with "a" when Choose A is clicked on tab A', () => {
    const onChoose = vi.fn();
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /choose option a/i }));
    expect(onChoose).toHaveBeenCalledWith('a');
  });

  it('calls onChoose with "b" when Choose B is clicked on tab B', () => {
    const onChoose = vi.fn();
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} onChoose={onChoose} />);
    fireEvent.click(screen.getByTestId('comparison-tab-b'));
    fireEvent.click(screen.getByRole('button', { name: /choose option b/i }));
    expect(onChoose).toHaveBeenCalledWith('b');
  });

  it('hides Choose CTA once a choice is made', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.queryByRole('button', { name: /choose option/i })).not.toBeInTheDocument();
  });

  it('shows check icon on chosen tab button when choice=a', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.getByLabelText('Option A chosen')).toBeInTheDocument();
  });

  it('shows check icon on chosen tab button when choice=b', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="b" />);
    // Tab defaults to the chosen option, so B is active and check is shown
    expect(screen.getByLabelText('Option B chosen')).toBeInTheDocument();
  });

  it('shows confirmation text after choice', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="a" />);
    expect(screen.getByText(/you chose option a/i)).toBeInTheDocument();
  });

  it('shows confirmation text for choice=b', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} choice="b" />);
    expect(screen.getByText(/you chose option b/i).textContent).toBe(
      'You chose option B. Tap the other tab to compare.',
    );
  });

  it('tab A is active by default (aria-selected=true)', () => {
    render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(screen.getByTestId('comparison-tab-a').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('comparison-tab-b').getAttribute('aria-selected')).toBe('false');
  });

  it('content area testid updates when tab switches', () => {
    const { container } = render(<ComparisonResponse optionA={OPTION_A} optionB={OPTION_B} />);
    expect(container.querySelector('[data-testid="comparison-option-a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comparison-option-b"]')).toBeNull();

    fireEvent.click(screen.getByTestId('comparison-tab-b'));
    expect(container.querySelector('[data-testid="comparison-option-b"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="comparison-option-a"]')).toBeNull();
  });
});
