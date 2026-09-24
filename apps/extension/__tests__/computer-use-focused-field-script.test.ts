/**
 * The page-side script that names the element keystrokes would land on. It runs
 * here against a real DOM because the gate is only as good as what this returns:
 * a frame it cannot see into has to answer "unknown", never "an ordinary element".
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { FOCUSED_FIELD_SIGNATURE_JS } from '../src/features/computer-use/cdpDriver';

type DocumentLike = { activeElement: Element | null };

// Run the way the sibling index-map test runs page-side scripts: indirect eval in jsdom.
const focusedFieldSignature = (0, eval)(FOCUSED_FIELD_SIGNATURE_JS) as (
  doc: DocumentLike,
) => string | null;

function field(type: string, name: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  document.body.append(input);
  return input;
}

function frameHolding(inner: () => DocumentLike | null): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  Object.defineProperty(frame, 'contentDocument', { get: inner });
  return frame;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('the focused field script', () => {
  it('names a focused password field', () => {
    const password = field('password', 'user_password');
    expect(focusedFieldSignature({ activeElement: password })).toContain(
      '|password|user_password|',
    );
  });

  it('answers unknown when nothing but the page holds focus', () => {
    expect(focusedFieldSignature({ activeElement: document.body })).toBeNull();
    expect(focusedFieldSignature({ activeElement: null })).toBeNull();
  });

  it('answers unknown for a frame it is not allowed to read', () => {
    const payment = frameHolding(() => {
      throw new DOMException('Blocked a frame with origin', 'SecurityError');
    });
    expect(focusedFieldSignature({ activeElement: payment })).toBeNull();
  });

  it('answers unknown for a frame whose document is withheld', () => {
    expect(focusedFieldSignature({ activeElement: frameHolding(() => null) })).toBeNull();
  });

  it('follows focus into a frame it can read', () => {
    const card = field('text', 'cardnumber');
    const frame = frameHolding(() => ({ activeElement: card }));
    expect(focusedFieldSignature({ activeElement: frame })).toContain('|cardnumber|');
  });

  it('follows focus into a shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const otp = document.createElement('input');
    otp.name = 'otp';
    shadow.append(otp);
    Object.defineProperty(shadow, 'activeElement', { get: () => otp });
    expect(focusedFieldSignature({ activeElement: host })).toContain('|otp|');
  });
});
