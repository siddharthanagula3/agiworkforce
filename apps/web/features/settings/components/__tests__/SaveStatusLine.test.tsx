import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveStatusLine } from '../SaveStatusLine';

describe('SaveStatusLine', () => {
  it('announces a save failure assertively and paints it with the destructive text role', () => {
    render(
      <SaveStatusLine failed style={{ color: 'var(--text-3)' }}>
        Changes were not saved
      </SaveStatusLine>,
    );

    const line = screen.getByRole('alert');
    expect(line).toHaveTextContent('Changes were not saved');
    expect(line).toHaveStyle({ color: 'var(--settings-destructive-text)' });
  });

  it('leaves a success or progress line polite and in the colour the section chose', () => {
    render(
      <SaveStatusLine failed={false} style={{ color: 'var(--text-3)' }}>
        Saved
      </SaveStatusLine>,
    );

    const line = screen.getByRole('status');
    expect(line).toHaveTextContent('Saved');
    expect(line).toHaveStyle({ color: 'var(--text-3)' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('overrides a class colour so a failure cannot inherit the muted one', () => {
    render(
      <SaveStatusLine failed className="text-muted-foreground">
        Save failed
      </SaveStatusLine>,
    );

    expect(screen.getByRole('alert')).toHaveStyle({ color: 'var(--settings-destructive-text)' });
  });
});
