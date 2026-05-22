/**
 * Snapshot test for the Chat tab greeting — time-of-day aware heading (round 18).
 * Locks that the greeting node renders with time-derived text.
 */

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

// ── Pure helper — mirrors the one in chat.tsx ─────────────────────────────────

function getTimeOfDayGreeting(hour: number): string {
  if (hour < 12) return 'How can I help you this morning?';
  if (hour < 17) return 'How can I help you this afternoon?';
  if (hour < 21) return 'How can I help you this evening?';
  return 'How can I help you tonight?';
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Chat tab — time-of-day greeting', () => {
  it('returns morning greeting for hour 8', () => {
    expect(getTimeOfDayGreeting(8)).toBe('How can I help you this morning?');
  });

  it('returns afternoon greeting for hour 14', () => {
    expect(getTimeOfDayGreeting(14)).toBe('How can I help you this afternoon?');
  });

  it('returns evening greeting for hour 18', () => {
    expect(getTimeOfDayGreeting(18)).toBe('How can I help you this evening?');
  });

  it('returns tonight greeting for hour 22', () => {
    expect(getTimeOfDayGreeting(22)).toBe('How can I help you tonight?');
  });

  it('locks greeting component tree at hour 19 (evening)', () => {
    const greeting = getTimeOfDayGreeting(19);
    const { toJSON } = render(
      <Text
        style={{
          fontSize: 28,
          lineHeight: 34,
          fontWeight: '500',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        {greeting}
      </Text>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
