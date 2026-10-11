import { describe, expect, it } from 'vitest';
import {
  MAILTO_MAX_LENGTH,
  emailMailtoLink,
  emailPlainText,
  emailRecipients,
  isRichBlockLanguage,
  parseEmailBlock,
  richBlocksAsPlainText,
} from '../richBlocks';

const COMPLETE_EMAIL = [
  'To: jane@example.com',
  'Subject: Thursday review',
  '',
  'Hi Jane,',
  '',
  'Can we move the review to Thursday at 3pm?',
  '',
  'Thanks,',
  'Sam',
].join('\n');

describe('isRichBlockLanguage', () => {
  it('recognises the two card fences and nothing else', () => {
    expect(isRichBlockLanguage('email')).toBe(true);
    expect(isRichBlockLanguage('writing')).toBe(true);
    expect(isRichBlockLanguage('markdown')).toBe(false);
    expect(isRichBlockLanguage('')).toBe(false);
  });
});

describe('parseEmailBlock on a finished fence', () => {
  it('reads the headers and keeps the body paragraphs intact', () => {
    const parsed = parseEmailBlock(COMPLETE_EMAIL);
    expect(parsed?.draft).toEqual({
      to: 'jane@example.com',
      cc: '',
      bcc: '',
      subject: 'Thursday review',
      body: 'Hi Jane,\n\nCan we move the review to Thursday at 3pm?\n\nThanks,\nSam',
    });
    expect(parsed?.headerFields).toEqual(['to', 'subject']);
  });

  it('accepts headers in any case and order, with Cc and Bcc', () => {
    const parsed = parseEmailBlock(
      'subject: Hello\nCC: a@x.com; b@x.com\nTO: c@x.com\nbcc: d@x.com\n\nBody',
    );
    expect(parsed?.draft.subject).toBe('Hello');
    expect(parsed?.draft.to).toBe('c@x.com');
    expect(parsed?.draft.cc).toBe('a@x.com; b@x.com');
    expect(parsed?.draft.bcc).toBe('d@x.com');
    expect(parsed?.headerFields).toEqual(['subject', 'cc', 'to', 'bcc']);
  });

  it('tolerates bold header names and a missing blank line before the body', () => {
    const parsed = parseEmailBlock('**To:** jane@example.com\n**Subject**: Hi\nHello Jane,\nBye');
    expect(parsed?.draft.to).toBe('jane@example.com');
    expect(parsed?.draft.subject).toBe('Hi');
    expect(parsed?.draft.body).toBe('Hello Jane,\nBye');
  });

  it('accepts an email with a subject and no recipient yet', () => {
    expect(parseEmailBlock('Subject: Intro\n\nHi there')?.draft.to).toBe('');
  });

  it('joins a repeated header instead of dropping the first value', () => {
    expect(parseEmailBlock('To: a@x.com\nTo: b@x.com\n\nHi')?.draft.to).toBe('a@x.com, b@x.com');
  });

  it('refuses text that does not start with a header, so it renders as prose', () => {
    expect(parseEmailBlock('Hi Jane,\n\nSee you Thursday.')).toBeNull();
    expect(parseEmailBlock('From: me@x.com\n\nHi')).toBeNull();
  });

  it('refuses an email with headers but no body', () => {
    expect(parseEmailBlock('To: jane@example.com\nSubject: Hi\n')).toBeNull();
  });

  it('refuses an email with only Cc and a body, which has nowhere to go', () => {
    expect(parseEmailBlock('Cc: a@x.com\n\nHello')).toBeNull();
  });
});

describe('parseEmailBlock while the fence streams', () => {
  it('keeps the card while only part of a header name has arrived', () => {
    expect(parseEmailBlock('To: jane@example.com\nSubj', true)?.draft.to).toBe('jane@example.com');
    expect(parseEmailBlock('T', true)).toEqual({
      draft: { to: '', cc: '', bcc: '', subject: '', body: '' },
      headerFields: [],
    });
  });

  it('shows the headers before the body arrives', () => {
    const parsed = parseEmailBlock('To: jane@example.com\nSubject: Thu', true);
    expect(parsed?.draft.subject).toBe('Thu');
    expect(parsed?.draft.body).toBe('');
  });

  it('streams the body as it grows', () => {
    expect(parseEmailBlock('To: j@x.com\n\nHi Ja', true)?.draft.body).toBe('Hi Ja');
  });

  it('falls back to prose as soon as the first line cannot be a header', () => {
    expect(parseEmailBlock('Hello', true)).toBeNull();
  });
});

describe('emailPlainText', () => {
  it('writes the headers that have values, a blank line, then the body', () => {
    const parsed = parseEmailBlock(COMPLETE_EMAIL);
    expect(parsed && emailPlainText(parsed.draft)).toBe(
      'To: jane@example.com\nSubject: Thursday review\n\nHi Jane,\n\nCan we move the review to Thursday at 3pm?\n\nThanks,\nSam',
    );
  });
});

describe('emailRecipients', () => {
  it('splits on commas and semicolons and drops empty entries', () => {
    expect(emailRecipients(' a@x.com, b@x.com;; c@x.com ')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
  });
});

describe('emailMailtoLink', () => {
  it('encodes every field and sends line breaks as CRLF', () => {
    const link = emailMailtoLink({
      to: 'jane@example.com, bob+ops@example.com',
      cc: 'c@x.com',
      bcc: '',
      subject: 'Q&A at 3pm?',
      body: 'Hi,\nSee you.',
    });
    expect(link.bodyIncluded).toBe(true);
    expect(link.href).toBe(
      'mailto:jane%40example.com,bob%2Bops%40example.com?cc=c%40x.com&subject=Q%26A%20at%203pm%3F&body=Hi%2C%0D%0ASee%20you.',
    );
  });

  it('leaves the body out of a link that would pass the length limit', () => {
    const link = emailMailtoLink({
      to: 'jane@example.com',
      cc: '',
      bcc: '',
      subject: 'Long',
      body: 'word '.repeat(MAILTO_MAX_LENGTH),
    });
    expect(link.bodyIncluded).toBe(false);
    expect(link.href).toBe('mailto:jane%40example.com?subject=Long');
  });
});

describe('richBlocksAsPlainText', () => {
  it('turns an email fence into the plain text its card copies', () => {
    const message = `Here is the draft:\n\n\`\`\`email\n${COMPLETE_EMAIL}\n\`\`\`\n\nWant changes?`;
    expect(richBlocksAsPlainText(message)).toBe(
      `Here is the draft:\n\n${emailPlainText(parseEmailBlock(COMPLETE_EMAIL)!.draft)}\n\nWant changes?`,
    );
  });

  it('keeps only the text of a writing fence, including a longer fence around code', () => {
    const message = '````writing\n## Note\n\n```js\nrun()\n```\n````\nAfter.';
    expect(richBlocksAsPlainText(message)).toBe('## Note\n\n```js\nrun()\n```\nAfter.');
  });

  it('leaves ordinary code fences exactly as written, even when they hold email-like text', () => {
    const message = 'Code:\n\n```python\nprint(1)\n```\n\n~~~\nTo: a@x.com\n\nHi\n~~~';
    expect(richBlocksAsPlainText(message)).toBe(message);
  });

  it('does not treat a fence nested in a code block as a card', () => {
    const message = '````markdown\n```email\nTo: a@x.com\n\nHi\n```\n````';
    expect(richBlocksAsPlainText(message)).toBe(message);
  });

  it('copies a malformed email fence as its raw text and an unclosed one to the end', () => {
    expect(richBlocksAsPlainText('```email\nHi Jane,\n\nSee you.\n```')).toBe(
      'Hi Jane,\n\nSee you.',
    );
    expect(richBlocksAsPlainText('Intro\n```writing\nDraft line')).toBe('Intro\nDraft line');
  });

  it('returns a message without fences unchanged', () => {
    expect(richBlocksAsPlainText('Plain **markdown** answer.')).toBe('Plain **markdown** answer.');
  });
});
