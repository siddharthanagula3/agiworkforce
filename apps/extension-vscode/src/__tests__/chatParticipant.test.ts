/**
 * chatParticipant.test.ts — Tests for chat participant prompt building and helpers
 *
 * Tests the pure functions exported from chatParticipant.ts:
 * buildSystemPrompt, buildUserMessage, isExecutionConfirmation pattern
 */

import { describe, it, expect } from 'vitest';

// Replicate the exported types and pure functions for testing
// (Cannot import directly due to vscode dependency)

interface EditorContext {
  fileName: string;
  languageId: string;
  selectedText: string;
  surroundingCode: string;
  workspaceName: string;
}

interface PromptOptions {
  command?: string;
  planModeEnabled: boolean;
  planOnly: boolean;
  mcpEnabled: boolean;
  desktopBridgeEnabled: boolean;
}

function buildSystemPrompt(ctx: EditorContext, options: PromptOptions): string {
  const { command, planModeEnabled, planOnly, mcpEnabled, desktopBridgeEnabled } = options;
  const parts: string[] = [
    'You are AGI Workforce, a model-agnostic AI coding assistant integrated into VS Code.',
    'You are knowledgeable, concise, and produce production-ready code.',
    'Always use Markdown formatting in your responses.',
    'When showing code, use fenced code blocks with the correct language identifier.',
  ];

  if (ctx.workspaceName !== '') {
    parts.push(`The user is working in workspace: "${ctx.workspaceName}".`);
  }
  if (ctx.fileName !== '') {
    parts.push(`The active file is: ${ctx.fileName} (language: ${ctx.languageId}).`);
  }
  if (ctx.selectedText !== '') {
    parts.push(
      `\nThe user has selected the following code:\n\`\`\`${ctx.languageId}\n${ctx.selectedText}\n\`\`\``,
    );
  }
  if (ctx.surroundingCode !== '' && ctx.selectedText === '') {
    parts.push(
      `\nHere is the surrounding code for context:\n\`\`\`${ctx.languageId}\n${ctx.surroundingCode}\n\`\`\``,
    );
  }

  if (command === 'fix') {
    parts.push(
      '\nFocus on identifying bugs, errors, or issues and providing corrected code with explanations.',
    );
  } else if (command === 'refactor') {
    parts.push(
      '\nFocus on improving code quality, readability, and maintainability. Explain each refactoring decision.',
    );
  } else if (command === 'tests') {
    parts.push(
      '\nGenerate comprehensive unit tests. Cover edge cases, error conditions, and happy paths.',
    );
  } else if (command === 'docs') {
    parts.push(
      '\nGenerate clear, accurate documentation comments (JSDoc / TSDoc / docstrings as appropriate for the language).',
    );
  } else if (command === 'explain') {
    parts.push(
      '\nProvide a clear, thorough explanation of what the code does, how it works, and why it is written this way.',
    );
  }

  if (mcpEnabled) {
    parts.push(
      '\nMCP integration is enabled. Use MCP tools when the backend exposes them; if unavailable, state that clearly.',
    );
  }
  if (desktopBridgeEnabled) {
    parts.push(
      '\nDesktop bridge integration is enabled. Prefer local tool context when available via the backend.',
    );
  }
  if (planModeEnabled && planOnly) {
    parts.push(
      '\nPlan mode is enabled. Respond with a numbered plan only. Do not provide final code changes until the user explicitly says "proceed".',
    );
  } else if (planModeEnabled) {
    parts.push(
      '\nPlan mode is enabled and user confirmed execution. Execute the plan and clearly summarize what was applied.',
    );
  }

  return parts.join('\n');
}

function isExecutionConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized === '') return false;
  return /^(yes|y|ok|okay|go|ship|do it|execute|run|continue|proceed)\b/.test(normalized);
}

function buildUserMessage(command: string | undefined, prompt: string, ctx: EditorContext): string {
  if (command === 'explain') {
    const target = ctx.selectedText !== '' ? 'the selected code' : `the file ${ctx.fileName}`;
    return `Explain ${target}. ${prompt}`.trim();
  }
  if (command === 'fix') {
    const target = ctx.selectedText !== '' ? 'the selected code' : 'the code in this file';
    return `Find and fix any bugs or issues in ${target}. Provide the corrected code and explain each fix. ${prompt}`.trim();
  }
  if (command === 'refactor') {
    return `Suggest and apply refactoring improvements to the selected code. Explain each change. ${prompt}`.trim();
  }
  if (command === 'tests') {
    const lang = ctx.languageId;
    return `Generate unit tests for the selected ${lang} code using the appropriate testing framework. Cover happy paths, edge cases, and error conditions. ${prompt}`.trim();
  }
  if (command === 'docs') {
    return `Generate documentation comments for the selected ${ctx.languageId} code. ${prompt}`.trim();
  }
  if (command === 'model') {
    return prompt !== ''
      ? prompt
      : 'What model are you currently using, and what models are available?';
  }
  return prompt;
}

// ── Tests ────────────────────────────────────────────────────────────────────

const defaultCtx: EditorContext = {
  fileName: '/src/app.ts',
  languageId: 'typescript',
  selectedText: 'const x = 1;',
  surroundingCode: 'import { foo } from "bar";\nconst x = 1;',
  workspaceName: 'my-project',
};

const defaultOptions: PromptOptions = {
  command: undefined,
  planModeEnabled: false,
  planOnly: false,
  mcpEnabled: false,
  desktopBridgeEnabled: false,
};

describe('buildSystemPrompt', () => {
  it('includes base instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, defaultOptions);
    expect(prompt).toContain('AGI Workforce');
    expect(prompt).toContain('Markdown');
    expect(prompt).toContain('fenced code blocks');
  });

  it('includes workspace name', () => {
    const prompt = buildSystemPrompt(defaultCtx, defaultOptions);
    expect(prompt).toContain('"my-project"');
  });

  it('includes active file info', () => {
    const prompt = buildSystemPrompt(defaultCtx, defaultOptions);
    expect(prompt).toContain('/src/app.ts');
    expect(prompt).toContain('typescript');
  });

  it('includes selected text in a code block', () => {
    const prompt = buildSystemPrompt(defaultCtx, defaultOptions);
    expect(prompt).toContain('```typescript');
    expect(prompt).toContain('const x = 1;');
  });

  it('includes surrounding code when no selection', () => {
    const ctx = { ...defaultCtx, selectedText: '' };
    const prompt = buildSystemPrompt(ctx, defaultOptions);
    expect(prompt).toContain('surrounding code');
    expect(prompt).toContain('import { foo }');
  });

  it('does not include surrounding code when there is a selection', () => {
    const prompt = buildSystemPrompt(defaultCtx, defaultOptions);
    expect(prompt).not.toContain('surrounding code');
  });

  it('adds fix-specific instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, command: 'fix' });
    expect(prompt).toContain('bugs, errors, or issues');
  });

  it('adds refactor-specific instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, command: 'refactor' });
    expect(prompt).toContain('code quality, readability');
  });

  it('adds test-specific instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, command: 'tests' });
    expect(prompt).toContain('edge cases');
  });

  it('adds docs-specific instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, command: 'docs' });
    expect(prompt).toContain('documentation comments');
  });

  it('adds explain-specific instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, command: 'explain' });
    expect(prompt).toContain('explanation of what the code does');
  });

  it('adds MCP instructions when enabled', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, mcpEnabled: true });
    expect(prompt).toContain('MCP integration is enabled');
  });

  it('adds desktop bridge instructions when enabled', () => {
    const prompt = buildSystemPrompt(defaultCtx, { ...defaultOptions, desktopBridgeEnabled: true });
    expect(prompt).toContain('Desktop bridge integration is enabled');
  });

  it('adds plan mode (plan only) instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, {
      ...defaultOptions,
      planModeEnabled: true,
      planOnly: true,
    });
    expect(prompt).toContain('numbered plan only');
  });

  it('adds plan mode (execution) instructions', () => {
    const prompt = buildSystemPrompt(defaultCtx, {
      ...defaultOptions,
      planModeEnabled: true,
      planOnly: false,
    });
    expect(prompt).toContain('Execute the plan');
  });

  it('omits workspace info for empty workspace name', () => {
    const ctx = { ...defaultCtx, workspaceName: '' };
    const prompt = buildSystemPrompt(ctx, defaultOptions);
    expect(prompt).not.toContain('workspace:');
  });

  it('omits file info for empty filename', () => {
    const ctx = { ...defaultCtx, fileName: '' };
    const prompt = buildSystemPrompt(ctx, defaultOptions);
    expect(prompt).not.toContain('active file');
  });
});

describe('isExecutionConfirmation', () => {
  it.each([
    'yes',
    'y',
    'ok',
    'okay',
    'go',
    'ship',
    'do it',
    'execute',
    'run',
    'continue',
    'proceed',
  ])('returns true for "%s"', (text) => {
    expect(isExecutionConfirmation(text)).toBe(true);
  });

  it('handles leading/trailing whitespace', () => {
    expect(isExecutionConfirmation('  yes  ')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isExecutionConfirmation('YES')).toBe(true);
    expect(isExecutionConfirmation('Proceed')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isExecutionConfirmation('')).toBe(false);
    expect(isExecutionConfirmation('   ')).toBe(false);
  });

  it('returns false for unrelated text', () => {
    expect(isExecutionConfirmation('explain this code')).toBe(false);
    expect(isExecutionConfirmation('no')).toBe(false);
    expect(isExecutionConfirmation('maybe later')).toBe(false);
  });

  it('matches only at word boundary', () => {
    expect(isExecutionConfirmation('yesplease')).toBe(false);
    expect(isExecutionConfirmation('yes please')).toBe(true);
  });
});

describe('buildUserMessage', () => {
  it('builds explain message for selected code', () => {
    const msg = buildUserMessage('explain', 'in detail', defaultCtx);
    expect(msg).toContain('Explain the selected code');
    expect(msg).toContain('in detail');
  });

  it('builds explain message for file when no selection', () => {
    const ctx = { ...defaultCtx, selectedText: '' };
    const msg = buildUserMessage('explain', '', ctx);
    expect(msg).toContain(`the file ${ctx.fileName}`);
  });

  it('builds fix message', () => {
    const msg = buildUserMessage('fix', '', defaultCtx);
    expect(msg).toContain('Find and fix any bugs');
    expect(msg).toContain('the selected code');
  });

  it('builds refactor message', () => {
    const msg = buildUserMessage('refactor', '', defaultCtx);
    expect(msg).toContain('refactoring improvements');
  });

  it('builds tests message with language', () => {
    const msg = buildUserMessage('tests', '', defaultCtx);
    expect(msg).toContain('typescript');
    expect(msg).toContain('unit tests');
  });

  it('builds docs message', () => {
    const msg = buildUserMessage('docs', '', defaultCtx);
    expect(msg).toContain('documentation comments');
  });

  it('returns default model message when no prompt', () => {
    const msg = buildUserMessage('model', '', defaultCtx);
    expect(msg).toContain('models are available');
  });

  it('returns prompt directly for model command with text', () => {
    const msg = buildUserMessage('model', 'Switch to claude', defaultCtx);
    expect(msg).toBe('Switch to claude');
  });

  it('returns raw prompt for general chat', () => {
    const msg = buildUserMessage(undefined, 'How do I sort?', defaultCtx);
    expect(msg).toBe('How do I sort?');
  });
});
