import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_LINK_TARGETS,
  PRODUCT_LINK_UNAVAILABLE_STATES,
  type ProductLinkTarget,
  type ProductLinkUnavailableState,
} from '@agiworkforce/types';
import { ProductLinkUnavailable, productLinkUnavailableCopy } from './ProductLinkUnavailable';

// Built at run time: a literal long dash in source fails the copy guard.
const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

const EVERY_CASE: [ProductLinkTarget, ProductLinkUnavailableState][] = PRODUCT_LINK_TARGETS.flatMap(
  (target) => PRODUCT_LINK_UNAVAILABLE_STATES.map((state) => [target, state] as const),
).map(([target, state]) => [target, state]);

describe('productLinkUnavailableCopy', () => {
  it.each(EVERY_CASE)('explains %s / %s without raw internals', (target, state) => {
    const { title, body } = productLinkUnavailableCopy(target, state);

    expect(title).toMatch(/\S/);
    expect(body).toMatch(/\S/);
    expect(`${title} ${body}`).not.toMatch(LONG_DASHES);
    expect(`${title} ${body}`).not.toMatch(/\b(?:null|undefined|Error|uuid|select |public\.)/i);
  });

  it('does not tell a signed-in user the content belongs to somebody else', () => {
    for (const target of PRODUCT_LINK_TARGETS) {
      const { body } = productLinkUnavailableCopy(target, 'unauthorized');

      expect(body).not.toMatch(/belongs to a different account/i);
      expect(body).toMatch(/workspace/i);
    }
  });

  it.each(EVERY_CASE)('offers %s / %s a way back into the product', (target, state) => {
    render(<ProductLinkUnavailable target={target} state={state} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringMatching(/^\//));
  });
});
