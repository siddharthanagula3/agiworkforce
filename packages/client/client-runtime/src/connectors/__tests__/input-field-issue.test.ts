import { describe, expect, it } from 'vitest';
import { connectorInputFieldError, connectorInputFieldIssue } from '../input-request';
import type { ConnectorInputField } from '../input-request';

const email: ConnectorInputField = {
  key: 'email',
  title: 'Email',
  kind: 'text',
  required: true,
  format: 'email',
  minLength: 3,
  maxLength: 10,
};
const count: ConnectorInputField = {
  key: 'count',
  title: 'Count',
  kind: 'number',
  required: false,
  integer: true,
  minimum: 1,
  maximum: 5,
};
const tags: ConnectorInputField = {
  key: 'tags',
  title: 'Tags',
  kind: 'choices',
  required: true,
  options: [],
  minItems: 2,
  maxItems: 3,
};

describe('connector input field checks', () => {
  it('names the issue and keeps the same message as before', () => {
    const cases: Array<[ConnectorInputField, string | string[] | undefined, string, string]> = [
      [email, '', 'required', 'This is required.'],
      [email, 'ab', 'too_short', 'Use at least 3 characters.'],
      [email, 'abcdefghijk', 'too_long', 'Use at most 10 characters.'],
      [email, 'nope', 'bad_format', 'Enter an email address.'],
      [count, 'x', 'not_a_number', 'Enter a number.'],
      [count, '1.5', 'not_whole', 'Enter a whole number.'],
      [count, '0', 'too_small', 'Enter 1 or more.'],
      [count, '9', 'too_large', 'Enter 5 or less.'],
      [tags, [], 'required', 'Choose an option.'],
      [tags, ['a'], 'too_short', 'Choose at least 2.'],
      [tags, ['a', 'b', 'c', 'd'], 'too_long', 'Choose at most 3.'],
    ];
    for (const [field, value, issue, message] of cases) {
      expect(connectorInputFieldIssue(field, value)).toBe(issue);
      expect(connectorInputFieldError(field, value)).toBe(message);
    }
  });

  it('accepts valid values', () => {
    expect(connectorInputFieldIssue(email, 'a@b.co')).toBeNull();
    expect(connectorInputFieldIssue(count, '')).toBeNull();
    expect(connectorInputFieldIssue(tags, ['a', 'b'])).toBeNull();
  });
});
