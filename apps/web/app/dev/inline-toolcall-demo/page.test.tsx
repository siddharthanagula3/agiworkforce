import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InlineToolCallDemoPage from './page';

const LOCAL_PATH_PATTERN = /(?:^|[\s"'`(])(?:~\/|\/Users\/|\/home\/|[A-Za-z]:\\)/;

describe('inline tool-call demo harness', () => {
  it('renders the harness without leaking a local filesystem path', () => {
    const { container } = render(<InlineToolCallDemoPage />);

    expect(screen.getByTestId('harness-marker')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(LOCAL_PATH_PATTERN);
  });

  it('keeps the tracked source free of machine-specific paths', () => {
    const source = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');

    expect(source).not.toMatch(LOCAL_PATH_PATTERN);
  });

  it('stays unreachable in production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => InlineToolCallDemoPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
