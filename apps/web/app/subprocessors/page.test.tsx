import { readFileSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import SubprocessorsPage from './page';

const SOURCE = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');

function declaredRecipients(): string[] {
  return [...SOURCE.matchAll(/\n\s{4}name:\s*'([^']+)'/g)].map((match) => match[1] as string);
}

function flatCopy(): string {
  return document.body.textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('SubprocessorsPage', () => {
  it('renders every recipient the page declares, so the list a guard reads is the list a reader sees', () => {
    render(<SubprocessorsPage />);

    const names = declaredRecipients();
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) {
      expect(screen.getByText(name), `${name} is declared but not rendered`).toBeInTheDocument();
    }
  });

  it('names the gateways and the voice role that can receive a prompt or microphone audio', () => {
    render(<SubprocessorsPage />);

    expect(screen.getByText('Cheaper Inference (operated by Keak)')).toBeInTheDocument();
    expect(
      screen.getByText('Experiential Labs (operated by Resolute Labs AI, Inc.)'),
    ).toBeInTheDocument();
    expect(screen.getByText('OpenAI (dictation and Voice Mode)')).toBeInTheDocument();

    const copy = flatCopy();
    expect(copy).toMatch(/Workers AI: an inference route that can serve a Managed Cloud chat/);
    expect(copy).toMatch(/Vercel AI Gateway: an inference route that can serve a Managed Cloud/);
  });

  it('states the condition under which a gateway route carries a request, rather than implying every one does', () => {
    render(<SubprocessorsPage />);
    const copy = flatCopy();

    expect(copy).toMatch(/cheapest admissible route for the model you picked/);
    expect(copy).toMatch(/neither every request nor every model/);
  });

  it('no longer claims managed traffic always reaches those providers through OpenRouter', () => {
    render(<SubprocessorsPage />);
    const copy = flatCopy();

    expect(copy).not.toMatch(/Always, for the MiniMax, Qwen and Zhipu models/);
    expect(copy).not.toMatch(/reached through OpenRouter rather than directly/);
    expect(copy).toMatch(/when AGI holds its own key for one of these providers/);
    expect(copy).toMatch(/When AGI does hold that provider’s key, the request goes direct/);
  });

  it('drops the recipient that receives nothing and records why', () => {
    render(<SubprocessorsPage />);

    expect(declaredRecipients()).not.toContain('MiniMax, Qwen and Zhipu');
    expect(flatCopy()).toMatch(/No MiniMax route is admitted for Managed Cloud traffic/);
  });

  it('states when the page was last updated', () => {
    render(<SubprocessorsPage />);

    expect(
      screen.getByText(new RegExp(`Last updated:\\s*${POLICY_LAST_UPDATED.subprocessors}`)),
    ).toBeInTheDocument();
  });
});
