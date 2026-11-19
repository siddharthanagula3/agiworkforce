import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..');
const CHAT_SOURCES = ['src/features/chat', 'app/(app)/chat', 'app/(app)/(tabs)'];
const MIN_TARGET = 44;
const PRESSABLE = /<(Pressable|PressableBox|TouchableOpacity)\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

function openingTag(source: string, start: number): string {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0 && source[index - 1] !== '=') {
      return source.slice(start, index);
    }
  }
  return source.slice(start);
}

function undersizedTargets(): string[] {
  const found: string[] = [];
  for (const dir of CHAT_SOURCES) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(PRESSABLE)) {
        const tag = openingTag(source, match.index ?? 0);
        if (!tag.includes('onPress') || tag.includes('hitSlop')) continue;
        const classSizes = [...tag.matchAll(/\b(?:w|h|size)-(\d+)\b/g)].map(
          (size) => Number(size[1]) * 4,
        );
        const pointSizes = [...tag.matchAll(/\b(?:width|height|minHeight|minWidth):\s*(\d+)/g)].map(
          (size) => Number(size[1]),
        );
        const sizes = [...classSizes, ...pointSizes];
        if (sizes.length > 0 && Math.max(...sizes) < MIN_TARGET) {
          const line = source.slice(0, match.index).split('\n').length;
          found.push(`${relative(ROOT, file)}:${line}`);
        }
      }
    }
  }
  return found;
}

describe('chat touch targets', () => {
  it('gives every sized control in the chat screens at least 44 by 44 points to press', () => {
    expect(undersizedTargets()).toEqual([]);
  });
});
