import { describe, expect, it } from 'vitest';
import { inlineCommandPrompt } from '../core/runInlineCommand';

const SELECTED = "    if (rest[i] === '--port') args.port = rest[++i];";
const CONTEXT = {
  before: '  for (let i = 0; i < rest.length; i++) {',
  after: "    else if (rest[i] === '--data') {",
  problems: ["line 12: Type 'string' is not assignable to type 'number'."],
};

describe('inline command prompts', () => {
  it('asks a fix for a drop-in replacement of the selected lines only', () => {
    const prompt = inlineCommandPrompt('fix', 'javascript', SELECTED, CONTEXT);

    expect(prompt).toContain(SELECTED);
    expect(prompt).toContain("Type 'string' is not assignable to type 'number'.");
    expect(prompt).toContain(CONTEXT.before);
    expect(prompt).toContain(CONTEXT.after);
    expect(prompt).toMatch(/replaces? (exactly )?the selected lines/i);
    expect(prompt).toMatch(/do not repeat the surrounding/i);
  });

  it('keeps the drop-in contract for every command that edits in place', () => {
    for (const command of ['fix', 'refactor', 'docs'] as const) {
      expect(inlineCommandPrompt(command, 'javascript', SELECTED, CONTEXT)).toMatch(
        /do not repeat the surrounding/i,
      );
    }
  });
});
