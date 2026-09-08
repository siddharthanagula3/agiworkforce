import { describe, expect, it } from 'vitest';
import { describeDevice, presentActivity } from '../activity-presentation';

function row(overrides: Partial<Parameters<typeof presentActivity>[0]> = {}) {
  return {
    id: 'act-1',
    event_type: 'api_call',
    endpoint: '/api/projects',
    user_agent: null,
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

// The panel used to render these rows directly, so a line read
// "/api/projects ::1 9/7/2026", which is a server log and not account activity.
describe('WEB-USE-SETTINGS-QUERIES-ACCOUNT-ACTIVITY-01 · what a row means', () => {
  it('says what happened, not which path it happened on', () => {
    expect(presentActivity(row())?.sentence).toBe('Viewed projects');
  });

  it('prefers what the audit writer classified over the path it arrived on', () => {
    expect(presentActivity(row({ event_type: 'login', endpoint: '/api/projects' }))?.sentence).toBe(
      'Signed in on a new device',
    );
  });

  it('falls back to the longest matching prefix so sub-paths stay understood', () => {
    expect(presentActivity(row({ endpoint: '/api/connectors/permissions' }))?.sentence).toBe(
      'Changed connector permissions',
    );
    expect(presentActivity(row({ endpoint: '/api/connectors/github/scopes' }))?.sentence).toBe(
      'Changed a connector',
    );
  });

  it('ignores a query string when matching', () => {
    expect(presentActivity(row({ endpoint: '/api/projects?limit=20' }))?.sentence).toBe(
      'Viewed projects',
    );
  });

  it('drops a row it does not understand rather than showing it raw', () => {
    expect(
      presentActivity(row({ event_type: 'unknown', endpoint: '/api/something/new' })),
    ).toBeNull();
    expect(presentActivity(row({ event_type: 'unknown', endpoint: null }))).toBeNull();
  });

  it('never carries an address', () => {
    const presented = presentActivity(row({ user_agent: 'Mozilla/5.0 (Macintosh) Chrome/120' }));
    expect(JSON.stringify(presented)).not.toMatch(/\d+\.\d+\.\d+\.\d+|::1/);
  });
});

describe('the device label, in the sessions list shape', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537', 'Chrome on Mac'],
    ['Mozilla/5.0 (Windows NT 10.0) Firefox/121', 'Firefox on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604', 'Safari on iPhone'],
    ['Mozilla/5.0 (Macintosh) Edg/120', 'Edge on Mac'],
  ])('reads %s as %s', (agent, expected) => {
    expect(describeDevice(agent)).toBe(expected);
  });

  it('says nothing rather than guessing when there is no agent', () => {
    expect(describeDevice(null)).toBeNull();
  });
});
