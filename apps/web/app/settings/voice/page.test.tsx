import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

import VoiceSettingsPage from './page';

describe('Web Voice settings', () => {
  beforeEach(() => {
    mocks.replace.mockClear();
  });

  it('opens Voice inside the Settings dialog like every other section', async () => {
    const { container } = render(<VoiceSettingsPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/chat?settings=voice'));
    expect(container).toBeEmptyDOMElement();
  });
});
