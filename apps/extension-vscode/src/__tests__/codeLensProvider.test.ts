/**
 * codeLensProvider.test.ts — Tests for AgiCodeLensProvider logic
 *
 * Validates that computeLenses surfaces the correct lenses for each
 * language and that the Refactor lens is present alongside Ask AI / Tests / Docs.
 */

import { describe, it, expect } from 'vitest';

// Replicate the pure logic under test (no vscode dependency).

function isFunctionOrClassLine(line: string, languageId: string): boolean {
  const trimmed = line.trimStart();

  if (
    trimmed === '' ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  ) {
    return false;
  }
  if (
    trimmed.startsWith('import ') ||
    trimmed.startsWith('from ') ||
    trimmed.startsWith('require(')
  ) {
    return false;
  }

  switch (languageId) {
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return (
        /^(export\s+)?(default\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
        /^(export\s+)?(default\s+)?class\s+\w/.test(trimmed) ||
        /^(export\s+)?(const|let)\s+\w+\s*=\s*(async\s+)?\(/.test(trimmed) ||
        /^(public|private|protected|static|async)\s+(async\s+)?\w+\s*\(/.test(trimmed)
      );

    case 'python':
      return /^(async\s+)?def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed);

    case 'go':
      return /^func\s+/.test(trimmed) || /^type\s+\w+\s+struct\s*\{/.test(trimmed);

    case 'rust':
      return (
        /^(pub\s+)?(async\s+)?fn\s+\w/.test(trimmed) ||
        /^(pub\s+)?struct\s+\w/.test(trimmed) ||
        /^(pub\s+)?enum\s+\w/.test(trimmed) ||
        /^impl\s+/.test(trimmed)
      );

    case 'java':
    case 'kotlin':
      return (
        /^(public|private|protected|static|abstract|final|override)\s+.*\w+\s*\(/.test(trimmed) ||
        /^(public\s+|private\s+|protected\s+)?(abstract\s+|final\s+)?class\s+\w/.test(trimmed) ||
        /^(public\s+|private\s+|protected\s+)?interface\s+\w/.test(trimmed)
      );

    case 'ruby':
      return (
        /^def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed) || /^module\s+\w/.test(trimmed)
      );

    case 'php':
      return (
        /^(public|private|protected|static)?\s*(function)\s+\w/.test(trimmed) ||
        /^(abstract\s+|final\s+)?class\s+\w/.test(trimmed)
      );

    case 'c':
    case 'cpp':
    case 'csharp':
      return (
        /^(public|private|protected|static|virtual|override|async)?\s*\w+[\w<>, ]*\s+\w+\s*\(/.test(
          trimmed,
        ) || /^(class|struct|enum)\s+\w/.test(trimmed)
      );

    case 'swift':
      return /^(public\s+|private\s+|internal\s+|open\s+)?(class|struct|enum|func|protocol)\s+\w/.test(
        trimmed,
      );

    default:
      return (
        /^(export\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
        /^(export\s+)?class\s+\w/.test(trimmed) ||
        /^def\s+\w/.test(trimmed) ||
        /^func\s+/.test(trimmed)
      );
  }
}

interface MockLens {
  lineIndex: number;
  title: string;
  command: string;
}

function computeLenses(lines: string[], languageId: string): MockLens[] {
  const lenses: MockLens[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isFunctionOrClassLine(line, languageId)) {
      lenses.push({ lineIndex: i, title: '$(hubot) Ask AI', command: 'agi-workforce.explain' });
      lenses.push({
        lineIndex: i,
        title: '$(beaker) Tests',
        command: 'agi-workforce.generateTests',
      });
      lenses.push({ lineIndex: i, title: '$(edit) Refactor', command: 'agi-workforce.refactor' });
      lenses.push({ lineIndex: i, title: '$(book) Docs', command: 'agi-workforce.docs' });
    }
  }
  return lenses;
}

// ── isFunctionOrClassLine ─────────────────────────────────────────────────────

describe('isFunctionOrClassLine — TypeScript', () => {
  const lang = 'typescript';

  it('matches exported async function', () => {
    expect(isFunctionOrClassLine('export async function fetchData() {', lang)).toBe(true);
  });

  it('matches plain function', () => {
    expect(isFunctionOrClassLine('function parseResult(raw: string): Result {', lang)).toBe(true);
  });

  it('matches class declaration', () => {
    expect(isFunctionOrClassLine('export class MyService {', lang)).toBe(true);
  });

  it('matches arrow function const', () => {
    expect(isFunctionOrClassLine('export const handler = async (req: Request) => {', lang)).toBe(
      true,
    );
  });

  it('matches class method', () => {
    expect(isFunctionOrClassLine('  public async handleRequest(', lang)).toBe(true);
  });

  it('rejects import statement', () => {
    expect(isFunctionOrClassLine("import { foo } from 'bar';", lang)).toBe(false);
  });

  it('rejects comment line', () => {
    expect(isFunctionOrClassLine('// This is a comment', lang)).toBe(false);
  });

  it('rejects empty line', () => {
    expect(isFunctionOrClassLine('', lang)).toBe(false);
    expect(isFunctionOrClassLine('   ', lang)).toBe(false);
  });

  it('rejects block comment opener', () => {
    expect(isFunctionOrClassLine('/* start */  function fake', lang)).toBe(false);
  });
});

describe('isFunctionOrClassLine — Python', () => {
  const lang = 'python';

  it('matches def', () => {
    expect(isFunctionOrClassLine('def calculate(x, y):', lang)).toBe(true);
  });

  it('matches async def', () => {
    expect(isFunctionOrClassLine('async def fetch_data():', lang)).toBe(true);
  });

  it('matches class', () => {
    expect(isFunctionOrClassLine('class MyModel(BaseModel):', lang)).toBe(true);
  });

  it('rejects non-function line', () => {
    expect(isFunctionOrClassLine('x = 42', lang)).toBe(false);
  });
});

describe('isFunctionOrClassLine — Go', () => {
  const lang = 'go';

  it('matches func', () => {
    expect(isFunctionOrClassLine('func NewServer(port int) *Server {', lang)).toBe(true);
  });

  it('matches struct type', () => {
    expect(isFunctionOrClassLine('type Server struct {', lang)).toBe(true);
  });

  it('rejects regular assignment', () => {
    expect(isFunctionOrClassLine('x := 42', lang)).toBe(false);
  });
});

describe('isFunctionOrClassLine — Rust', () => {
  const lang = 'rust';

  it('matches pub fn', () => {
    expect(isFunctionOrClassLine('pub fn process(input: &str) -> Result<(), Error> {', lang)).toBe(
      true,
    );
  });

  it('matches fn (no pub)', () => {
    expect(isFunctionOrClassLine('fn helper() {', lang)).toBe(true);
  });

  it('matches impl block', () => {
    expect(isFunctionOrClassLine('impl MyStruct {', lang)).toBe(true);
  });

  it('matches pub struct', () => {
    expect(isFunctionOrClassLine('pub struct Config {', lang)).toBe(true);
  });

  it('rejects let binding', () => {
    expect(isFunctionOrClassLine('let x = 42;', lang)).toBe(false);
  });
});

describe('isFunctionOrClassLine — Ruby', () => {
  const lang = 'ruby';

  it('matches def', () => {
    expect(isFunctionOrClassLine('def initialize(name)', lang)).toBe(true);
  });

  it('matches class', () => {
    expect(isFunctionOrClassLine('class UserService', lang)).toBe(true);
  });

  it('matches module', () => {
    expect(isFunctionOrClassLine('module Helpers', lang)).toBe(true);
  });
});

// ── computeLenses — lens set per declaration ──────────────────────────────────

describe('computeLenses lens set', () => {
  const lines = [
    'export async function fetchUsers(): Promise<User[]> {',
    '  const result = await db.query();',
    '  return result.rows;',
    '}',
  ];

  it('emits 4 lenses per matched function line', () => {
    const lenses = computeLenses(lines, 'typescript');
    expect(lenses).toHaveLength(4);
  });

  it('always includes Ask AI lens', () => {
    const lenses = computeLenses(lines, 'typescript');
    expect(lenses.some((l) => l.command === 'agi-workforce.explain')).toBe(true);
  });

  it('always includes Tests lens', () => {
    const lenses = computeLenses(lines, 'typescript');
    expect(lenses.some((l) => l.command === 'agi-workforce.generateTests')).toBe(true);
  });

  it('always includes Refactor lens', () => {
    const lenses = computeLenses(lines, 'typescript');
    const refactor = lenses.find((l) => l.command === 'agi-workforce.refactor');
    expect(refactor).toBeDefined();
    expect(refactor?.title).toBe('$(edit) Refactor');
  });

  it('always includes Docs lens', () => {
    const lenses = computeLenses(lines, 'typescript');
    expect(lenses.some((l) => l.command === 'agi-workforce.docs')).toBe(true);
  });

  it('all lenses are anchored to the declaration line (index 0)', () => {
    const lenses = computeLenses(lines, 'typescript');
    expect(lenses.every((l) => l.lineIndex === 0)).toBe(true);
  });

  it('emits no lenses for comment-only content', () => {
    const commentLines = ['// just a comment', '/* another */', '', '  '];
    const lenses = computeLenses(commentLines, 'typescript');
    expect(lenses).toHaveLength(0);
  });

  it('emits lenses for each of N matched declarations', () => {
    const multiLines = [
      'function foo() {',
      '  return 1;',
      '}',
      'function bar() {',
      '  return 2;',
      '}',
    ];
    const lenses = computeLenses(multiLines, 'typescript');
    // 4 lenses × 2 declarations
    expect(lenses).toHaveLength(8);
  });

  it('lens order: Ask AI → Tests → Refactor → Docs', () => {
    const lenses = computeLenses(lines, 'typescript');
    const commands = lenses.map((l) => l.command);
    expect(commands).toEqual([
      'agi-workforce.explain',
      'agi-workforce.generateTests',
      'agi-workforce.refactor',
      'agi-workforce.docs',
    ]);
  });
});

// ── Python computeLenses ──────────────────────────────────────────────────────

describe('computeLenses — Python source', () => {
  const pyLines = [
    'class DataProcessor:',
    '    def __init__(self, config):',
    '        self.config = config',
    '    async def process(self, data):',
    '        return data',
  ];

  it('detects class and both def lines', () => {
    const lenses = computeLenses(pyLines, 'python');
    const lineIndices = [...new Set(lenses.map((l) => l.lineIndex))];
    expect(lineIndices).toEqual([0, 1, 3]);
  });

  it('emits 4 lenses per Python declaration', () => {
    const lenses = computeLenses(pyLines, 'python');
    // 3 declarations × 4 lenses
    expect(lenses).toHaveLength(12);
  });
});
