import { describe, expect, it } from 'vitest';
import { parseStatusMessages } from '.';

const NOW = new Date('2026-07-31T12:00:00.000Z').getTime();

describe('parseStatusMessages', () => {
  it('accepts supported incident rows and removes expired notices', () => {
    expect(
      parseStatusMessages(
        {
          messages: [
            {
              id: 'incident-live',
              severity: 'warning',
              title: 'Provider delays',
              message: 'Requests may take longer than usual.',
              dismissible: true,
              expiresAt: '2026-07-31T12:30:00.000Z',
            },
            {
              id: 'incident-expired',
              severity: 'info',
              title: 'Resolved',
              message: 'This notice is no longer current.',
              dismissible: true,
              expiresAt: '2026-07-31T11:59:59.000Z',
            },
          ],
        },
        NOW,
      ),
    ).toEqual([
      {
        id: 'incident-live',
        severity: 'warning',
        title: 'Provider delays',
        message: 'Requests may take longer than usual.',
        dismissible: true,
        expiresAt: '2026-07-31T12:30:00.000Z',
      },
    ]);
  });

  it('drops malformed rows independently instead of crashing the banner', () => {
    expect(
      parseStatusMessages(
        {
          messages: [
            {
              id: 'bad-severity',
              severity: 'emergency',
              title: 'Unknown severity',
              message: 'Must not reach the renderer.',
              dismissible: false,
            },
            {
              id: 'bad-expiry',
              severity: 'critical',
              title: 'Invalid expiry',
              message: 'Must not become permanent.',
              dismissible: false,
              expiresAt: 'not-a-date',
            },
            {
              id: 'incident-valid',
              severity: 'critical',
              title: 'Service unavailable',
              message: '',
              dismissible: false,
            },
          ],
        },
        NOW,
      ),
    ).toEqual([
      {
        id: 'incident-valid',
        severity: 'critical',
        title: 'Service unavailable',
        message: '',
        dismissible: false,
      },
    ]);
  });

  it.each([null, [], {}, { messages: null }, { messages: 'not-an-array' }])(
    'returns an empty list for a malformed response: %j',
    (value) => {
      expect(parseStatusMessages(value, NOW)).toEqual([]);
    },
  );
});
