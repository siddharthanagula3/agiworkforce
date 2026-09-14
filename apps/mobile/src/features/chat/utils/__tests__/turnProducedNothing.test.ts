import { turnProducedNothing, type TurnOutputSignals } from '../messageStreamError';

function signals(overrides: Partial<TurnOutputSignals> = {}): TurnOutputSignals {
  return {
    content: '',
    toolCallCount: 0,
    generatedFileCount: 0,
    interactiveCardCount: 0,
    hasResearchRun: false,
    hasStreamError: false,
    ...overrides,
  };
}

describe('turnProducedNothing', () => {
  it('calls a turn with nothing at all empty', () => {
    expect(turnProducedNothing(signals())).toBe(true);
    expect(turnProducedNothing(signals({ content: '   \n' }))).toBe(true);
  });

  it('does not call a paused research plan empty', () => {
    expect(turnProducedNothing(signals({ hasResearchRun: true }))).toBe(false);
  });

  it('does not call a turn with any other output empty', () => {
    expect(turnProducedNothing(signals({ content: 'hi' }))).toBe(false);
    expect(turnProducedNothing(signals({ toolCallCount: 1 }))).toBe(false);
    expect(turnProducedNothing(signals({ generatedFileCount: 1 }))).toBe(false);
    expect(turnProducedNothing(signals({ interactiveCardCount: 1 }))).toBe(false);
    expect(turnProducedNothing(signals({ hasStreamError: true }))).toBe(false);
  });
});
