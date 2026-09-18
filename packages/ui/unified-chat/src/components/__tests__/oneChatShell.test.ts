import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const componentsDir = join(srcDir, 'components');

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

  it('keeps the greeting copy in one place', () => {
    const owners = sourceFiles(srcDir).filter((file) =>
      readFileSync(file, 'utf8').includes('Burning the midnight oil'),
    );
    expect(owners).toEqual([join(srcDir, 'lib', 'greeting.ts')]);
  });
});
