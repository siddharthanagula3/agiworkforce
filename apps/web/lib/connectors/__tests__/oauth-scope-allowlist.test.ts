import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_OAUTH_SCOPE_CEILINGS,
  SCOPE_REVIEW_PENDING,
  canonicalConnectorScope,
} from '../oauth-scope-allowlist';
import { grantCoversScopes, grantRequiresReconsent, scopeEscalation } from '../scopes-escalation';

const GMAIL_CEILING = CONNECTOR_OAUTH_SCOPE_CEILINGS['gmail'] as readonly string[];
const GMAIL_SEND = GMAIL_CEILING.find((scope) => scope.endsWith('gmail.send')) as string;
const GMAIL_READ = GMAIL_CEILING.find((scope) => scope.endsWith('gmail.readonly')) as string;
const GMAIL_COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';

describe('scopeEscalation', () => {
  it('reports nothing when the grant already covers the request', () => {
    const result = scopeEscalation('gmail', [GMAIL_READ, GMAIL_SEND], [GMAIL_READ]);
    expect(result).toEqual({ escalated: false, added: [], refused: [] });
  });

  it('names the scope a connector newly asks for', () => {
    const result = scopeEscalation('gmail', [GMAIL_READ], [GMAIL_READ, GMAIL_SEND]);
    expect(result.escalated).toBe(true);
    expect(result.added).toEqual([GMAIL_SEND]);
  });

  it('requires explicit consent for draft access beyond a read and send grant', () => {
    expect(
      scopeEscalation('gmail', [GMAIL_READ, GMAIL_SEND], [GMAIL_READ, GMAIL_COMPOSE, GMAIL_SEND]),
    ).toEqual({ escalated: true, added: [GMAIL_COMPOSE], refused: [] });
  });

  it('does not read a spelling change as an escalation', () => {
    const short = canonicalConnectorScope(GMAIL_SEND);
    expect(short).not.toBe(GMAIL_SEND);
    expect(scopeEscalation('gmail', [GMAIL_SEND], [GMAIL_SEND]).escalated).toBe(false);
    expect(scopeEscalation('gmail', [short], [GMAIL_SEND]).escalated).toBe(false);
  });

  it('refuses a scope above the ceiling instead of counting it as an escalation', () => {
    const result = scopeEscalation(
      'gmail',
      [GMAIL_READ],
      [GMAIL_READ, 'https://www.googleapis.com/auth/gmail.modify'],
    );
    expect(result.escalated).toBe(false);
    expect(result.refused).toEqual(['https://www.googleapis.com/auth/gmail.modify']);
  });

  it('does not count a duplicate spelling of the same added scope twice', () => {
    const result = scopeEscalation('gmail', [GMAIL_READ], [GMAIL_SEND, GMAIL_SEND]);
    expect(result.added).toEqual([GMAIL_SEND]);
  });
});

describe('grantRequiresReconsent', () => {
  it('requires re-consent when the connector widened what it declares', () => {
    expect(
      grantRequiresReconsent({
        connectorId: 'gmail',
        grantedScopes: [GMAIL_READ],
        declaredScopes: [GMAIL_READ, GMAIL_SEND],
      }),
    ).toBe(true);
  });

  it('requires re-consent for an existing Gmail grant without compose access', () => {
    expect(
      grantRequiresReconsent({
        connectorId: 'gmail',
        grantedScopes: [GMAIL_READ, GMAIL_SEND],
        declaredScopes: [GMAIL_READ, GMAIL_COMPOSE, GMAIL_SEND],
      }),
    ).toBe(true);
    expect(grantCoversScopes([GMAIL_READ, GMAIL_SEND], [GMAIL_COMPOSE])).toBe(false);
  });

  it('requires re-consent before reading existing Drive file contents', () => {
    const grantedScopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ];
    const existingFileRead = 'https://www.googleapis.com/auth/drive.readonly';
    expect(
      scopeEscalation('google-drive', grantedScopes, [...grantedScopes, existingFileRead]),
    ).toEqual({ escalated: true, added: [existingFileRead], refused: [] });
    expect(grantCoversScopes(grantedScopes, [existingFileRead])).toBe(false);
  });

  it('requires re-consent before listing calendars with an events-only grant', () => {
    const events = 'https://www.googleapis.com/auth/calendar.events';
    const calendarListRead = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
    expect(scopeEscalation('google-calendar', [events], [events, calendarListRead])).toEqual({
      escalated: true,
      added: [calendarListRead],
      refused: [],
    });
    expect(
      grantRequiresReconsent({
        connectorId: 'google-calendar',
        grantedScopes: [events],
        declaredScopes: [events, calendarListRead],
      }),
    ).toBe(true);
    expect(grantCoversScopes([events], [calendarListRead])).toBe(false);
  });

  it('requires explicit consent to add People directory and profile access', () => {
    const contactsRead = 'https://www.googleapis.com/auth/contacts.readonly';
    const directoryRead = 'https://www.googleapis.com/auth/directory.readonly';
    const profileRead = 'https://www.googleapis.com/auth/userinfo.profile';
    const declaredScopes = [contactsRead, directoryRead, profileRead];
    expect(scopeEscalation('google-contacts', [contactsRead], declaredScopes)).toEqual({
      escalated: true,
      added: [directoryRead, profileRead],
      refused: [],
    });
    expect(
      grantRequiresReconsent({
        connectorId: 'google-contacts',
        grantedScopes: [contactsRead],
        declaredScopes,
      }),
    ).toBe(true);
    expect(grantCoversScopes([contactsRead], [directoryRead, profileRead])).toBe(false);
  });

  it('leaves an unchanged connector alone', () => {
    expect(
      grantRequiresReconsent({
        connectorId: 'gmail',
        grantedScopes: GMAIL_CEILING,
        declaredScopes: [GMAIL_READ, GMAIL_SEND],
      }),
    ).toBe(false);
  });

  it('stays quiet for a connector whose ceiling is still under review', () => {
    const pending = Object.entries(CONNECTOR_OAUTH_SCOPE_CEILINGS).find(
      ([, ceiling]) => ceiling === SCOPE_REVIEW_PENDING,
    );
    if (!pending) return;
    expect(
      grantRequiresReconsent({
        connectorId: pending[0],
        grantedScopes: [],
        declaredScopes: ['anything'],
      }),
    ).toBe(false);
  });
});

describe('grantCoversScopes', () => {
  it('answers in canonical form', () => {
    expect(grantCoversScopes([canonicalConnectorScope(GMAIL_SEND)], [GMAIL_SEND])).toBe(true);
    expect(grantCoversScopes([GMAIL_READ], [GMAIL_SEND])).toBe(false);
  });
});
