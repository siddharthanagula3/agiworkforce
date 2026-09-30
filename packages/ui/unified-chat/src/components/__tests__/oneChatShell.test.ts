import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { GREETING_TIME_BANDS, resolveGreetingHeadline } from '@agiworkforce/utils/greeting';
import { BrandedGreeting } from '../BrandedGreeting';
import { afterEach, describe, it, expect, vi } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const componentsDir = join(srcDir, 'components');
const greetingOwner = createRequire(import.meta.url).resolve('@agiworkforce/utils/greeting');

afterEach(() => {
  vi.useRealTimers();
});

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !full.includes('__tests__')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('one chat shell', () => {
  it('ships a single transcript, not a second unused one', () => {
    expect(existsSync(join(componentsDir, 'ChatStream.tsx'))).toBe(false);
    expect(existsSync(join(componentsDir, 'MessageList.tsx'))).toBe(true);
    expect(readFileSync(join(srcDir, 'index.ts'), 'utf8')).not.toContain('ChatStream');
  });

  it('ships no navigation rail of its own, the host mounts one', () => {
    expect(existsSync(join(componentsDir, 'Sidebar.tsx'))).toBe(false);
    expect(existsSync(join(componentsDir, 'ConversationItem.tsx'))).toBe(false);
    const chatInterface = readFileSync(join(componentsDir, 'ChatInterface.tsx'), 'utf8');
    expect(chatInterface).toContain('{sidebarSlot}');
  });

  it('keeps the greeting copy in the published utility owner', () => {
    const marker = GREETING_TIME_BANDS.night.variants[2];
    if (!marker) throw new Error('The canonical night greeting must exist');
    const files = [...sourceFiles(srcDir), ...sourceFiles(dirname(greetingOwner))];
    expect(files).toContain(greetingOwner);
    const owners = files.filter((file) => readFileSync(file, 'utf8').includes(marker));
    expect(owners).toEqual([greetingOwner]);
  });

  it.each([4, 7, 12, 17, 21, 0].flatMap((hour) => [1, 2, 3].map((day) => ({ hour, day }))))(
    'renders the canonical greeting at hour $hour on day $day',
    ({ hour, day }) => {
      const now = new Date(2026, 8, day, hour);
      vi.useFakeTimers();
      vi.setSystemTime(now);
      render(createElement(BrandedGreeting, { userName: 'Alice Wonderland' }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        resolveGreetingHeadline(now, 'Alice Wonderland'),
      );
    },
  );
});
