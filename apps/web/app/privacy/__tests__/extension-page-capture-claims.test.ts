import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_APP = join(__dirname, '..', '..');
const EXTENSION_SRC = join(WEB_APP, '..', '..', 'extension', 'src');

function read(...segments: string[]): string {
  return readFileSync(join(...segments), 'utf8');
}

function collapsed(source: string): string {
  return source.replace(/\s+/gu, ' ').replace(/&rsquo;/gu, '’');
}

const privacy = collapsed(read(WEB_APP, 'privacy', 'page.tsx'));
const pageActions = read(EXTENSION_SRC, 'features', 'content', 'in-page-panel', 'pageActions.ts');
const pageObservation = read(EXTENSION_SRC, 'features', 'content', 'pageObservation.ts');
const fieldRules = read(EXTENSION_SRC, 'features', 'content', 'elementReader.ts');
const chatClient = read(EXTENSION_SRC, 'features', 'cloud-bridge', 'freeTrialClient.ts');

describe('/privacy, what a Chrome extension page attach sends', () => {
  it('states the character cap the extension enforces', () => {
    const cap = /export const MAX_PAGE_TEXT_CHARACTERS = ([\d_]+);/u.exec(pageActions)?.[1];
    expect(cap, 'MAX_PAGE_TEXT_CHARACTERS not found').toBeDefined();
    const characters = Number(cap!.replace(/_/gu, '')).toLocaleString('en-US');
    expect(privacy).toContain(`sends up to ${characters} characters taken from that page`);
  });

  it('says form field contents go with the page text, because the capture includes them', () => {
    expect(pageObservation).toContain('Current form state:');
    expect(privacy).toContain('what is currently in its visible form fields');
    expect(privacy).toMatch(/including page text, form field contents, addresses and screenshots/u);
  });

  it('names only the field kinds the extension leaves out', () => {
    for (const [token, words] of [
      ['password', 'password'],
      ['cvv', 'payment card'],
      ['otp', 'one-time code'],
      ['pin', 'PIN'],
      ['ssn', 'Social Security number'],
    ] as const) {
      expect(fieldRules).toContain(`'${token}'`);
      expect(privacy).toContain(words);
    }
  });

  it('discloses the time zone name each extension chat request carries', () => {
    expect(chatClient).toMatch(/client_timezone: browserTimeZone\(\)/u);
    expect(privacy).toContain('your browser’s time zone name');
  });

  it('counts pages the extension reads among the ways private messages can reach us', () => {
    expect(privacy).toMatch(
      /let the Chrome extension read or act on a page that shows it, such as an email you attach/u,
    );
  });
});
