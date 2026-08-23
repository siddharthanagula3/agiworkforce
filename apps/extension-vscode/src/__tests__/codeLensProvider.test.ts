import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { AgiCodeLensProvider } from '../features/code-lens/codeLensProvider';

const token = { isCancellationRequested: false } as vscode.CancellationToken;

let documentSeq = 0;

function documentOf(lines: string[], languageId: string): vscode.TextDocument {
  documentSeq += 1;
  return {
    uri: vscode.Uri.file(`/workspace/src/fixture-${documentSeq}.txt`),
    languageId,
    version: 1,
    getText: () => lines.join('\n'),
  } as unknown as vscode.TextDocument;
}

function lensesFor(lines: string[], languageId: string): vscode.CodeLens[] {
  return new AgiCodeLensProvider().provideCodeLenses(documentOf(lines, languageId), token);
}

function isDeclaration(line: string, languageId: string): boolean {
  return lensesFor([line], languageId).length > 0;
}

describe('code lenses — TypeScript declarations', () => {
  const lang = 'typescript';

  it('lenses an exported async function', () => {
    expect(isDeclaration('export async function fetchData() {', lang)).toBe(true);
  });

  it('lenses a plain function', () => {
    expect(isDeclaration('function parseResult(raw: string): Result {', lang)).toBe(true);
  });

  it('lenses a class declaration', () => {
    expect(isDeclaration('export class MyService {', lang)).toBe(true);
  });

  it('lenses an arrow-function const', () => {
    expect(isDeclaration('export const handler = async (req: Request) => {', lang)).toBe(true);
  });

  it('lenses a class method', () => {
    expect(isDeclaration('  public async handleRequest(', lang)).toBe(true);
  });

  it('leaves import statements alone', () => {
    expect(isDeclaration("import { foo } from 'bar';", lang)).toBe(false);
  });

  it('leaves comments alone', () => {
    expect(isDeclaration('// This is a comment', lang)).toBe(false);
    expect(isDeclaration('/* start */  function fake', lang)).toBe(false);
  });

  it('leaves blank lines alone', () => {
    expect(isDeclaration('', lang)).toBe(false);
    expect(isDeclaration('   ', lang)).toBe(false);
  });
});

describe('code lenses — Python declarations', () => {
  const lang = 'python';

  it('lenses def and async def', () => {
    expect(isDeclaration('def calculate(x, y):', lang)).toBe(true);
    expect(isDeclaration('async def fetch_data():', lang)).toBe(true);
  });

  it('lenses a class', () => {
    expect(isDeclaration('class MyModel(BaseModel):', lang)).toBe(true);
  });

  it('leaves assignments alone', () => {
    expect(isDeclaration('x = 42', lang)).toBe(false);
  });
});

describe('code lenses — Go declarations', () => {
  const lang = 'go';

  it('lenses func', () => {
    expect(isDeclaration('func NewServer(port int) *Server {', lang)).toBe(true);
  });

  it('lenses a struct type', () => {
    expect(isDeclaration('type Server struct {', lang)).toBe(true);
  });

  it('leaves short assignments alone', () => {
    expect(isDeclaration('x := 42', lang)).toBe(false);
  });
});

describe('code lenses — Rust declarations', () => {
  const lang = 'rust';

  it('lenses pub fn and bare fn', () => {
    expect(isDeclaration('pub fn process(input: &str) -> Result<(), Error> {', lang)).toBe(true);
    expect(isDeclaration('fn helper() {', lang)).toBe(true);
  });

  it('lenses impl blocks and pub structs', () => {
    expect(isDeclaration('impl MyStruct {', lang)).toBe(true);
    expect(isDeclaration('pub struct Config {', lang)).toBe(true);
  });

  it('leaves let bindings alone', () => {
    expect(isDeclaration('let x = 42;', lang)).toBe(false);
  });
});

describe('code lenses — Ruby declarations', () => {
  const lang = 'ruby';

  it('lenses def, class and module', () => {
    expect(isDeclaration('def initialize(name)', lang)).toBe(true);
    expect(isDeclaration('class UserService', lang)).toBe(true);
    expect(isDeclaration('module Helpers', lang)).toBe(true);
  });
});

describe('code lenses — the lens set on a declaration', () => {
  const lines = [
    'export async function fetchUsers(): Promise<User[]> {',
    '  const result = await db.query();',
    '  return result.rows;',
    '}',
  ];

  it('offers Ask AI, Tests, Refactor and Docs in that order', () => {
    expect(lensesFor(lines, 'typescript').map((lens) => lens.command?.command)).toEqual([
      'agi-workforce.explain',
      'agi-workforce.generateTests',
      'agi-workforce.refactor',
      'agi-workforce.docs',
    ]);
  });

  it('labels each lens for the editor gutter', () => {
    expect(lensesFor(lines, 'typescript').map((lens) => lens.command?.title)).toEqual([
      '$(hubot) Ask AI',
      '$(beaker) Tests',
      '$(edit) Refactor',
      '$(book) Docs',
    ]);
  });

  it('gives every lens a tooltip naming the product', () => {
    for (const lens of lensesFor(lines, 'typescript')) {
      expect(lens.command?.tooltip, lens.command?.command).toMatch(/AGI Workforce/);
    }
  });

  it('anchors every lens to the declaration line', () => {
    for (const lens of lensesFor(lines, 'typescript')) {
      expect((lens.range.start as vscode.Position).line).toBe(0);
    }
  });

  it('passes each command the whole declaration body, not just its first line', () => {
    for (const lens of lensesFor(lines, 'typescript')) {
      const [target] = (lens.command?.arguments ?? []) as vscode.Range[];
      expect(target, lens.command?.command).toBeDefined();
      expect((target.start as vscode.Position).line).toBe(0);
      expect((target.end as vscode.Position).line).toBe(3);
    }
  });

  it('offers nothing on comment-only content', () => {
    expect(lensesFor(['// just a comment', '/* another */', '', '  '], 'typescript')).toEqual([]);
  });

  it('offers a full set per declaration in a multi-declaration file', () => {
    const lenses = lensesFor(
      ['function foo() {', '  return 1;', '}', 'function bar() {', '  return 2;', '}'],
      'typescript',
    );

    expect(lenses).toHaveLength(8);
    expect([
      ...new Set(lenses.map((lens) => (lens.range.start as vscode.Position).line)),
    ]).toEqual([0, 3]);
  });

  it('lenses Python class and def lines, four apiece', () => {
    const lenses = lensesFor(
      [
        'class DataProcessor:',
        '    def __init__(self, config):',
        '        self.config = config',
        '    async def process(self, data):',
        '        return data',
      ],
      'python',
    );

    expect([
      ...new Set(lenses.map((lens) => (lens.range.start as vscode.Position).line)),
    ]).toEqual([0, 1, 3]);
    expect(lenses).toHaveLength(12);
  });
});

describe('code lenses — recomputation', () => {
  it('reuses the cached lenses until the document version changes', () => {
    const provider = new AgiCodeLensProvider();
    const lines = ['function foo() {', '  return 1;', '}'];
    const uri = vscode.Uri.file('/workspace/src/cached.ts');
    const getText = vi.fn(() => lines.join('\n'));
    const document = { uri, languageId: 'typescript', version: 1, getText };

    provider.provideCodeLenses(document as unknown as vscode.TextDocument, token);
    provider.provideCodeLenses(document as unknown as vscode.TextDocument, token);
    expect(getText).toHaveBeenCalledTimes(1);

    provider.provideCodeLenses(
      { ...document, version: 2 } as unknown as vscode.TextDocument,
      token,
    );
    expect(getText).toHaveBeenCalledTimes(2);
  });
});
