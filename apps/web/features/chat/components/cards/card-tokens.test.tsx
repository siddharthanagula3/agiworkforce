import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { CalculationCard } from './CalculationCard';
import { ComparisonCard } from './ComparisonCard';
import { RecipeCard } from './RecipeCard';
import { StepsCard } from './StepsCard';

const CALCULATION = `## Monthly burn

Step 1: Salaries = 42000
Step 2: Hosting = 3000
Result: 45000 USD
`;

const COMPARISON = `# Postgres vs MySQL

## Postgres
### Pros
- Rich type system

## MySQL
### Cons
- Weaker JSON support

## Winner
Overall, Postgres wins on correctness.
`;

const STEPS = `# Laptop setup

Two quick things before you start.

## Step 1: Unbox the laptop
- Check the accessories

## Step 2: Sign in
- Use your corporate account
`;

const RECIPE = `# Pancakes

Prep time: 10 min
Servings: 4

## Ingredients
- 200g flour

## Instructions
1. Mix everything
`;

const CARDS = [
  {
    name: 'calculation',
    root: '.calculation-card',
    node: <CalculationCard content={CALCULATION} />,
  },
  { name: 'comparison', root: '.comparison-card', node: <ComparisonCard content={COMPARISON} /> },
  { name: 'steps', root: '.steps-card', node: <StepsCard content={STEPS} /> },
  { name: 'recipe', root: '.recipe-card', node: <RecipeCard content={RECIPE} /> },
] as const;

// Every per-type palette the four cards used to paint their chrome with. None
// of these map to a --chat-* token, so none went through the GOV-34 contrast
// pass the tokens record.
const RAW_PALETTE =
  /\b(?:bg|from|to|via|border|text)-(?:blue|sky|indigo|purple|violet|teal|cyan|amber|orange)-\d{2,3}\b/;

function classNames(root: Element): string[] {
  return [root, ...Array.from(root.querySelectorAll('*'))].map(
    (el) => el.getAttribute('class') ?? '',
  );
}

describe('response-format card chrome is tokenized', () => {
  it.each(CARDS)('$name card paints its shell from --chat-* tokens', ({ root, node }) => {
    const { container } = render(node);
    const card = container.querySelector(root);
    expect(card).not.toBeNull();

    const header = card?.firstElementChild;
    expect(header?.getAttribute('class') ?? '').toContain('bg-[var(--chat-surface-hover)]');
    expect(card?.getAttribute('class') ?? '').toContain('border-[var(--chat-border)]');
  });

  it.each(CARDS)('$name card carries no un-tokenized gradient header', ({ root, node }) => {
    const { container } = render(node);
    const card = container.querySelector(root);
    const header = card?.firstElementChild?.getAttribute('class') ?? '';

    expect(header).not.toMatch(/\bbg-gradient-/);
    expect(header).not.toMatch(RAW_PALETTE);
  });

  it.each(CARDS)(
    '$name card keeps raw palette off every background and border',
    ({ root, node }) => {
      const { container } = render(node);
      const card = container.querySelector(root);
      expect(card).not.toBeNull();

      const offenders = classNames(card as Element).filter((cls) =>
        // Icon colour is the one sanctioned per-type accent, so `text-*` on a
        // decorative glyph is allowed; backgrounds and borders are not.
        /\b(?:bg|from|to|via|border)-(?:blue|sky|indigo|purple|violet|teal|cyan|amber|orange)-\d{2,3}\b/.test(
          cls,
        ),
      );

      expect(offenders).toEqual([]);
    },
  );

  it('paints the comparison winner from the audited warning tokens', () => {
    const { container } = render(<ComparisonCard content={COMPARISON} />);
    const highlighted = Array.from(container.querySelectorAll('*')).filter((el) =>
      (el.getAttribute('class') ?? '').includes('bg-[var(--chat-warning-bg)]'),
    );

    expect(highlighted.length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('border-[var(--chat-warning-border)]');
  });
});
