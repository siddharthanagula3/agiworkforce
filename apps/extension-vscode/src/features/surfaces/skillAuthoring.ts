import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getActiveWorkspaceFolderSync } from '../../platform/workspaceFolders';

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;

function personalSkillsRoot(): string {
  const configured = process.env['AGIWORKFORCE_HOME']?.trim();
  const home =
    configured && path.isAbsolute(configured)
      ? configured
      : path.join(os.homedir(), '.agiworkforce');
  return path.join(home, 'skills');
}

function skillFile(name: string, description: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: ${description.replace(/\n/gu, ' ')}`,
    '---',
    '',
    `# ${name}`,
    '',
    'Describe, step by step, what to do when this skill is used.',
    '',
  ].join('\n');
}

export async function createSkill(): Promise<boolean> {
  const folder = getActiveWorkspaceFolderSync();
  const scope = await vscode.window.showQuickPick(
    [
      {
        label: '$(account) Personal',
        description: 'Every folder you open with AGI',
        root: personalSkillsRoot(),
      },
      ...(folder === undefined
        ? []
        : [
            {
              label: '$(folder) This project',
              description: `${folder.name}, shared with anyone who opens it; allow it once before it loads`,
              root: path.join(folder.uri.fsPath, '.agiworkforce', 'skills'),
            },
          ]),
    ],
    { title: 'AGI Workforce, New skill', placeHolder: 'Where should the skill live?' },
  );
  if (scope === undefined) return false;

  const name = (
    await vscode.window.showInputBox({
      title: 'AGI Workforce, New skill',
      prompt: 'A short name in lowercase with hyphens, such as release-notes',
      ignoreFocusOut: true,
      validateInput: (value) =>
        SKILL_NAME_RE.test(value.trim()) ? null : 'Use lowercase letters, digits and hyphens.',
    })
  )?.trim();
  if (!name) return false;

  const description = (
    await vscode.window.showInputBox({
      title: `AGI Workforce, ${name}`,
      prompt: 'When should AGI use this skill? The model reads this to decide.',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() === '' ? 'Describe when to use it.' : null),
    })
  )?.trim();
  if (!description) return false;

  const file = vscode.Uri.file(path.join(scope.root, name, 'SKILL.md'));
  try {
    await vscode.workspace.fs.stat(file);
    void vscode.window.showWarningMessage(
      `AGI Workforce: a skill named ${name} already exists there.`,
    );
    return false;
  } catch {
    await vscode.workspace.fs.writeFile(file, Buffer.from(skillFile(name, description), 'utf8'));
  }
  await vscode.window.showTextDocument(file);
  return true;
}
