import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeExecutionBlock } from './CodeExecutionBlock';

const FAILED_RUN = {
  stdout: '',
  stderr: 'Traceback (most recent call last):\nZeroDivisionError: division by zero',
  returnCode: 1,
};

describe('CodeExecutionBlock failure output', () => {
  it('colours stderr with a token that is defined in both themes', () => {
    render(<CodeExecutionBlock result={FAILED_RUN} />);

    const header = screen.getByText('Stderr');
    const body = screen.getByText(/ZeroDivisionError/);
    const exitCode = screen.getByText('Exit code: 1');

    for (const node of [header, body, exitCode]) {
      expect(node.className).toContain('text-[var(--chat-destructive)]');
      expect(node.className).not.toMatch(/text-red-\d/);
    }
  });
});
