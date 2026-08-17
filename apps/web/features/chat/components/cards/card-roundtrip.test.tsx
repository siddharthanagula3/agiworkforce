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
});
