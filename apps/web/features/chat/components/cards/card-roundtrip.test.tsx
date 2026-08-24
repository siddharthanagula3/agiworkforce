import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CalculationCard } from './CalculationCard';
import { ComparisonCard } from './ComparisonCard';
import { RecipeCard } from './RecipeCard';
import { StepsCard } from './StepsCard';

const STEPS = `# Deploy the service

Follow these steps to ship a release.

## Step 1: Build the image
- Run the build script

### Requirements
- Docker 25 or newer

## Step 2: Push the tag
- Tag with the release number

## Troubleshooting
- If the push fails, re-authenticate against the registry.
`;

const CALCULATION = `## Monthly burn

Step 1: Salaries = 42000
Step 2: Hosting = 3000
Result: 45000 USD

### Assumptions
- Headcount stays flat for the quarter.
- Hosting is billed on the annual plan.
`;

const COMPARISON = `# Postgres vs MySQL

## Postgres
Postgres is the older of the two engines.

### Background
- Released in 1996.

### Pros
- Rich type system

### Cons
- Heavier memory use

## MySQL

### Pros
- Simple replication

## Migration notes
- Dump with pg_dump before switching.

## Winner
Overall, Postgres wins on correctness.
`;

const RECIPE = `# Pancakes

## About this recipe
Adapted from a diner griddle recipe.

Prep time: 10 min
Servings: 4

## Ingredients
- 200g flour

## Instructions
1. Mix everything
`;

const CALCULATION_INLINE_FORMULA = `## Compound growth

The identity \`a * (1+r)^n = FV\` explains the projection.

Result: 1000 USD
`;

const CALCULATION_PREFIXED_RESULT = `## Shopping trip

So the grand total: $47.50
`;

const CALCULATION_NO_RESULT = `Given the running total, this is what remains:

\`Remaining = Budget - Spent\`
`;

const COMPARISON_DESCRIPTIVE_HEADINGS = `# Postgres vs MySQL

## Postgres

### Pros of running Postgres in production
- Rich type system

### Cons worth knowing about
- Heavier memory use

## MySQL
### Pros
- Simple replication
`;

const COMPARISON_INLINE_WINNER = `# Postgres vs MySQL

## Postgres
### Pros
- Rich type system

## MySQL
### Pros
- Simple replication

## Winner: Postgres — better correctness guarantees overall
`;

const STEPS_UNICODE = `# Café setup 🍵

Configura tu café favorito antes de continuar.

## Step 1: Elige el grano ☕
- Selecciona un grano 100% arábica

## Step 2: 磨豆 (moler el café)
- Usa un molinillo cónico
`;

const STEPS_NESTED_MARKDOWN = `# Configure the service

## Step 1: Update the config
- Set the **timeout** to *500ms* for staging
`;

const STEPS_HUGE_EXTRA = `# Deploy the service

## Step 1: Build the image
- Run the build script

## Appendix
${Array.from({ length: 300 }, (_, i) => `- Detail item ${i + 1} of the rollout checklist`).join('\n')}
`;

describe('rich-format card parsers round-trip their source', () => {
  it('steps card keeps a sub-heading and a trailing section', () => {
    render(<StepsCard content={STEPS} />);

    expect(screen.getByText('Requirements')).toBeInTheDocument();
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(
      screen.getByText(/If the push fails, re-authenticate against the registry/),
    ).toBeInTheDocument();
  });

  it('steps card keeps a trailing section out of the last step', async () => {
    render(<StepsCard content={STEPS} />);

    await userEvent.click(screen.getByRole('button', { expanded: false, name: /Push the tag/ }));

    const steps = screen.getByRole('list', { name: 'Steps' });
    expect(within(steps).getByText('Tag with the release number')).toBeInTheDocument();
    expect(within(steps).queryByText(/re-authenticate against the registry/)).toBeNull();
    expect(within(steps).queryByText(/^##/)).toBeNull();
  });

  it('calculation card keeps notes that follow the result', () => {
    render(<CalculationCard content={CALCULATION} />);

    expect(screen.getByText('Assumptions')).toBeInTheDocument();
    expect(screen.getByText(/Headcount stays flat for the quarter/)).toBeInTheDocument();
    expect(screen.getByText(/Hosting is billed on the annual plan/)).toBeInTheDocument();
  });

  it('comparison card keeps section prose and an unrecognised section', () => {
    render(<ComparisonCard content={COMPARISON} />);

    expect(screen.getByText(/Postgres is the older of the two engines/)).toBeInTheDocument();
    expect(screen.getByText('Migration notes')).toBeInTheDocument();
    expect(screen.getByText(/Dump with pg_dump before switching/)).toBeInTheDocument();
  });

  it('comparison card does not file an unrelated bullet under a pros list', () => {
    render(<ComparisonCard content={COMPARISON} />);

    const mysqlPros = screen.getByText('Simple replication').closest('ul');
    expect(mysqlPros).not.toBeNull();
    expect(within(mysqlPros as HTMLElement).queryByText(/pg_dump/)).toBeNull();
  });

  it('comparison card keeps pros on the item a sub-section interrupted', () => {
    render(<ComparisonCard content={COMPARISON} />);

    const postgresPros = screen.getByText('Rich type system').closest('div.rounded-lg');
    expect(within(postgresPros as HTMLElement).getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByText(/Released in 1996/)).toBeInTheDocument();
  });

  it('recipe card keeps a preamble section that is neither ingredients nor instructions', () => {
    render(<RecipeCard content={RECIPE} />);

    expect(screen.getByText('About this recipe')).toBeInTheDocument();
    expect(screen.getByText(/Adapted from a diner griddle recipe/)).toBeInTheDocument();
  });

  it('recipe card still renders the sections it recognises', () => {
    render(<RecipeCard content={RECIPE} />);

    expect(screen.getByText('200g flour')).toBeInTheDocument();
    expect(screen.getByText('Mix everything')).toBeInTheDocument();
    expect(screen.getByText('Prep:')).toBeInTheDocument();
  });

  it('calculation card keeps prose surrounding an inline formula', () => {
    render(<CalculationCard content={CALCULATION_INLINE_FORMULA} />);

    const description = screen.getByText(/The identity/);
    expect(description.textContent).toContain('explains the projection');
    expect(screen.getByText('a * (1+r)^n = FV')).toBeInTheDocument();
  });

  it('calculation card keeps the prefix before a result keyword', () => {
    render(<CalculationCard content={CALCULATION_PREFIXED_RESULT} />);

    expect(screen.getByText(/So the grand/)).toBeInTheDocument();
    expect(screen.getByText('$47.50')).toBeInTheDocument();
  });

  it('calculation card degrades gracefully with no explicit result keyword', () => {
    render(<CalculationCard content={CALCULATION_NO_RESULT} />);

    expect(screen.getByText(/Given the running total, this is what remains/)).toBeInTheDocument();
    expect(screen.getByText('Remaining = Budget - Spent')).toBeInTheDocument();
    expect(screen.getByText('Budget - Spent')).toBeInTheDocument();
  });

  it('comparison card keeps descriptive text trailing a pros/cons heading', () => {
    render(<ComparisonCard content={COMPARISON_DESCRIPTIVE_HEADINGS} />);

    expect(screen.getByText('of running Postgres in production')).toBeInTheDocument();
    expect(screen.getByText('worth knowing about')).toBeInTheDocument();
  });

  it('comparison card keeps a winner reason written inline in the heading', () => {
    render(<ComparisonCard content={COMPARISON_INLINE_WINNER} />);

    expect(screen.getByText(/better correctness guarantees overall/)).toBeInTheDocument();
  });

  it('steps card preserves unicode content verbatim', () => {
    render(<StepsCard content={STEPS_UNICODE} />);

    expect(screen.getByText('Café setup 🍵')).toBeInTheDocument();
    expect(screen.getByText(/Selecciona un grano 100% arábica/)).toBeInTheDocument();
    expect(screen.getByText(/磨豆 \(moler el café\)/)).toBeInTheDocument();
  });

  it('steps card preserves nested markdown syntax verbatim in a detail line', () => {
    render(<StepsCard content={STEPS_NESTED_MARKDOWN} />);

    expect(screen.getByText('Set the **timeout** to *500ms* for staging')).toBeInTheDocument();
  });

  it('steps card keeps every line of a large trailing section', () => {
    render(<StepsCard content={STEPS_HUGE_EXTRA} />);

    const section = screen.getByText('Appendix').closest('section');
    expect(section).not.toBeNull();

    const items = within(section as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(300);
    expect(items[0]?.textContent).toBe('Detail item 1 of the rollout checklist');
    expect(items[299]?.textContent).toBe('Detail item 300 of the rollout checklist');
  });
});
