import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConversationStatsPanel, summarizeConversationUsage } from '../ConversationStatsPanel';
import type { ChatMessage } from '../../lib/types';

function reply(id: string, usage?: Record<string, number>): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'answer',
    createdAt: '2026-08-16T12:00:00.000Z',
    ...(usage ? { metadata: { usage } } : {}),
  };
}

const question: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'question',
  createdAt: '2026-08-16T12:00:00.000Z',
};

describe('summarizeConversationUsage', () => {
  it('sums each field across replies', () => {
    const stats = summarizeConversationUsage([
      question,
      reply('a1', { inputTokens: 100, outputTokens: 50 }),
      reply('a2', { inputTokens: 20, outputTokens: 5, reasoningTokens: 7 }),
    ]);
    expect(stats.totals.inputTokens).toBe(120);
    expect(stats.totals.outputTokens).toBe(55);
    expect(stats.totals.reasoningTokens).toBe(7);
    expect(stats.reportedTurns).toBe(2);
    expect(stats.assistantTurns).toBe(2);
  });

  it('leaves a field absent when no reply reported it', () => {
    const stats = summarizeConversationUsage([reply('a1', { inputTokens: 10 })]);
    expect(stats.totals.inputTokens).toBe(10);
    expect(stats.totals.cacheReadTokens).toBeUndefined();
  });

  it('counts replies that reported nothing so the total can be labelled a floor', () => {
    const stats = summarizeConversationUsage([
      reply('a1', { inputTokens: 10, outputTokens: 2 }),
      reply('a2'),
      reply('a3'),
    ]);
    expect(stats.assistantTurns).toBe(3);
    expect(stats.reportedTurns).toBe(1);
  });

  it('ignores a non-numeric usage value rather than coercing it', () => {
    const poisoned: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'answer',
      metadata: { usage: { inputTokens: '900', outputTokens: 5 } },
    };
    const stats = summarizeConversationUsage([poisoned]);
    expect(stats.totals.inputTokens).toBeUndefined();
    expect(stats.totals.outputTokens).toBe(5);
  });

  it('ignores user turns even if one carries a usage bag', () => {
    const stats = summarizeConversationUsage([
      { ...question, metadata: { usage: { inputTokens: 999 } } },
    ]);
    expect(stats.assistantTurns).toBe(0);
    expect(stats.totals.inputTokens).toBeUndefined();
  });
});

describe('ConversationStatsPanel', () => {
  it('renders only the fields the provider reported', () => {
    render(
      <ConversationStatsPanel
        messages={[question, reply('a1', { inputTokens: 128, outputTokens: 64 })]}
      />,
    );
    const panel = screen.getByTestId('stats-panel');
    expect(panel.textContent).toContain('128');
    expect(panel.textContent).toContain('64');
    expect(panel.textContent).toContain('192');
    expect(panel.textContent).not.toContain('Cache write tokens');
  });

  it('says so plainly when no reply reported usage', () => {
    render(<ConversationStatsPanel messages={[question, reply('a1')]} />);
    expect(screen.getByTestId('stats-panel').textContent).toContain('reported no token counts');
  });

  it('calls a partial total a floor instead of presenting it as complete', () => {
    render(
      <ConversationStatsPanel
        messages={[reply('a1', { inputTokens: 10, outputTokens: 2 }), reply('a2')]}
      />,
    );
    expect(screen.getByTestId('stats-panel').textContent).toContain('floor');
  });
});
