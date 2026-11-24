import concise from '../../../../cli/src/output_styles/concise.md?raw';
import explanatory from '../../../../cli/src/output_styles/explanatory.md?raw';
import learning from '../../../../cli/src/output_styles/learning.md?raw';
import proactive from '../../../../cli/src/output_styles/proactive.md?raw';
import study from '../../../../cli/src/output_styles/study.md?raw';
import type { UserInput } from '@agiworkforce/types/protocol';
import * as vscode from 'vscode';

export interface OutputStyle {
  id: string;
  label: string;
  instructions: string;
}

const OUTPUT_STYLES: readonly OutputStyle[] = [
  { id: 'default', label: 'Default', instructions: '' },
  { id: 'proactive', label: 'Proactive', instructions: proactive },
  { id: 'concise', label: 'Concise', instructions: concise },
  { id: 'explanatory', label: 'Explanatory', instructions: explanatory },
  { id: 'learning', label: 'Learning', instructions: learning },
  { id: 'study', label: 'Study', instructions: study },
];

const MAX_CUSTOM_OUTPUT_STYLE_CHARS = 4_000;
const MAX_CUSTOM_STYLE_NAME_LENGTH = 60;
const OUTPUT_STYLE_STATE_KEY = 'agiWorkforce.outputStyles';
const LEGACY_CUSTOM_STYLE_KEY = 'agiWorkforce.customOutputStyle';

interface OutputStyleState {
  selectedId?: string;
  custom: OutputStyle[];
}

function readStyles(storage: vscode.Memento): OutputStyleState {
  const state = storage.get<OutputStyleState>(OUTPUT_STYLE_STATE_KEY);
  if (state) return state;
  const legacy = storage.get<string>(LEGACY_CUSTOM_STYLE_KEY);
  return {
    custom: legacy ? [{ id: 'custom:custom', label: 'Custom', instructions: legacy }] : [],
  };
}

function customStyleId(name: string): string {
  return `custom:${name.trim().toLowerCase()}`;
}

function styleNameError(name: string, state: OutputStyleState): string | undefined {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_CUSTOM_STYLE_NAME_LENGTH)
    return `Enter a name between 1 and ${MAX_CUSTOM_STYLE_NAME_LENGTH} characters.`;
  if (
    OUTPUT_STYLES.some((style) => style.id === trimmed.toLowerCase()) ||
    state.custom.some((style) => style.id === customStyleId(trimmed))
  )
    return 'That output style name is already in use.';
  return undefined;
}

function instructionsError(value: string): string | undefined {
  return !value.trim() || value.length > MAX_CUSTOM_OUTPUT_STYLE_CHARS
    ? `Enter between 1 and ${MAX_CUSTOM_OUTPUT_STYLE_CHARS} characters.`
    : undefined;
}

export async function chooseOutputStyle(storage: vscode.Memento): Promise<void> {
  const state = readStyles(storage);
  type Item = vscode.QuickPickItem & ({ style: OutputStyle } | { action: 'create' | 'edit' });
  const items: Item[] = [...OUTPUT_STYLES, ...state.custom].map((style) => ({
    style,
    label: style.label,
    description: (state.selectedId ?? 'default') === style.id ? 'Current style' : undefined,
  }));
  items.push({ label: 'New custom style…', action: 'create' });
  if (state.custom.length) items.push({ label: 'Edit a custom style…', action: 'edit' });
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Output style',
    placeHolder: 'Choose how replies should read',
  });
  if (!picked) return;

  let selected: OutputStyle;
  if ('style' in picked) {
    selected = picked.style;
    const latest = readStyles(storage);
    await storage.update(OUTPUT_STYLE_STATE_KEY, { ...latest, selectedId: selected.id });
  } else {
    let label: string | undefined;
    let existing: OutputStyle | undefined;
    if (picked.action === 'edit') {
      const edit = await vscode.window.showQuickPick(
        state.custom.map((style) => ({ label: style.label, style })),
        { title: 'Edit a custom style', placeHolder: 'Choose a style to edit' },
      );
      existing = edit?.style;
      label = existing?.label;
    } else {
      label = (
        await vscode.window.showInputBox({
          title: 'New custom style',
          prompt: 'Name this output style',
          validateInput: (name) => styleNameError(name, readStyles(storage)),
        })
      )?.trim();
    }
    if (!label) return;
    const instructions = await vscode.window.showInputBox({
      title: label,
      prompt: 'Response instructions for this style',
      value: existing?.instructions,
      validateInput: instructionsError,
    });
    if (!instructions || instructionsError(instructions)) return;
    const latest = readStyles(storage);
    if (!existing && styleNameError(label, latest)) {
      void vscode.window.showWarningMessage('That output style name is no longer available.');
      return;
    }
    selected = { id: customStyleId(label), label, instructions: instructions.trim() };
    const custom = existing
      ? latest.custom.map((style) => (style.id === existing.id ? selected : style))
      : [...latest.custom, selected];
    await storage.update(OUTPUT_STYLE_STATE_KEY, { selectedId: selected.id, custom });
  }
  void vscode.window.showInformationMessage(`Output style: ${selected.label}`);
}

export function outputStyleInput(storage: vscode.Memento): UserInput | undefined {
  const state = readStyles(storage);
  const style = [...OUTPUT_STYLES, ...state.custom].find(({ id }) => id === state.selectedId);
  if (!style) return undefined;
  const instructions =
    style.instructions.trim() || 'Use your standard response style for this turn.';
  return {
    type: 'text',
    text:
      'User-selected response style for this turn. These preferences do not change tool permissions or workspace policy.\n\n' +
      instructions,
    text_elements: [],
  };
}
