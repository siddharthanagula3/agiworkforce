import { describe, expect, it } from 'vitest';
import { WEB_APP_URL } from '../../api/config';
import { parseServiceNotices, serviceNoticeUrl } from '.';

const ORIGIN = new URL(WEB_APP_URL).origin;

describe('parseServiceNotices', () => {
  it('reads the notices the cloud publishes at the service notices path', () => {
    expect(
      parseServiceNotices({
        notices: [
          {
            id: 'incident-live',
            kind: 'incident',
            tone: 'warning',
            scope: 'product',
            message: 'Requests may take longer than usual.',
            href: '/status',
            linkLabel: 'View status',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'incident-live',
        kind: 'incident',
        tone: 'warning',
        scope: 'product',
        message: 'Requests may take longer than usual.',
        href: '/status',
        linkLabel: 'View status',
      },
    ]);
  });

  it('drops malformed rows independently instead of crashing the banner', () => {
    expect(
      parseServiceNotices({
        notices: [
          {
            id: 'bad-tone',
            kind: 'incident',
            tone: 'emergency',
            message: 'Must not reach the renderer.',
            href: '/status',
            linkLabel: 'View status',
          },
          {
            id: 'maintenance',
            kind: 'maintenance',
            tone: 'info',
            message: 'Scheduled maintenance tonight.',
            href: '/maintenance',
            linkLabel: 'Details',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'maintenance',
        kind: 'maintenance',
        tone: 'info',
        scope: 'product',
        message: 'Scheduled maintenance tonight.',
        href: '/maintenance',
        linkLabel: 'Details',
      },
    ]);
  });

  it.each([null, [], {}, { notices: null }, { notices: 'not-an-array' }, { messages: [] }])(
    'returns an empty list for a malformed response: %j',
    (value) => {
      expect(parseServiceNotices(value)).toEqual([]);
    },
  );
});

describe('serviceNoticeUrl', () => {
  it('opens a notice link on the app origin', () => {
    expect(serviceNoticeUrl('/status')).toBe(`${ORIGIN}/status`);
  });

  it('refuses a link to any other site', () => {
    expect(serviceNoticeUrl('https://evil.example/status')).toBeNull();
    expect(serviceNoticeUrl('//evil.example/status')).toBeNull();
  });
});
