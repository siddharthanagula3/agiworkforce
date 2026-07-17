import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backgroundSource = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');

describe('tabs.onUpdated context boundary', () => {
  it('does not transfer page context on navigation, including allowlisted pages', () => {
    expect(backgroundSource).not.toContain('syncTabContextWithDesktop');
    expect(backgroundSource).not.toMatch(/tabs\.onUpdated[\s\S]*?type:\s*['"]page_context['"]/);
  });

  it('fails closed for legacy implicit context-sync messages', () => {
    const handler = backgroundSource.slice(
      backgroundSource.indexOf("case 'SYNC_PAGE_CONTEXT'"),
      backgroundSource.indexOf("case 'APPROVE_CONTEXT_HANDOFF'"),
    );
    expect(handler).toContain('Implicit page-context transfer is disabled');
    expect(handler).not.toContain('sendNativeRequest');
  });
});
