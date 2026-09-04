import { describe, expect, it, vi } from 'vitest';

const navMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => navMocks);

import CustomizePage from './page';

function open(section?: string) {
  return CustomizePage({
    searchParams: Promise.resolve(section ? { section } : {}),
  });
}

describe('/chat/customize', () => {
  it('opens General when no section is named, for profile and instructions', async () => {
    await expect(open()).rejects.toThrow('REDIRECT:/settings/general');
  });

  it('opens Skills when the link names it', async () => {
    await expect(open('skills')).rejects.toThrow('REDIRECT:/settings/skills');
  });

  it('opens Connectors when the link names it', async () => {
    await expect(open('connectors')).rejects.toThrow('REDIRECT:/settings/connectors');
  });

  it('opens Plugins when the link names it', async () => {
    await expect(open('plugins')).rejects.toThrow('REDIRECT:/settings/plugins');
  });

  it('falls back to General for a section this entry point does not own', async () => {
    await expect(open('billing')).rejects.toThrow('REDIRECT:/settings/general');
    await expect(open('bogus')).rejects.toThrow('REDIRECT:/settings/general');
  });
});
