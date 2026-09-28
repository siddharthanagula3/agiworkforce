import * as vscode from 'vscode';
import {
  PREFERRED_FORMATTINGS,
  PREFERRED_LENGTHS,
  RESPONSE_LANGUAGE_AUTO,
  RESPONSE_STYLES,
  RESPONSE_STYLE_GUIDANCE,
  TECHNICAL_LEVELS,
  normalizeResponseStylePreference,
  type ResponseStylePreference,
} from '@agiworkforce/types';
import {
  patchAccountPreferences,
  readAccountPreferences,
  type PreferenceNamespace,
} from '../../utils/accountPreferences';

const PERSONALIZATION_NAMESPACE = 'personalization';
const TRAIT_LOW = 0;
const TRAIT_HIGH = 100;

type Namespace = PreferenceNamespace;

interface ChoiceItem extends vscode.QuickPickItem {
  value: unknown;
}

interface SettingItem extends vscode.QuickPickItem {
  edit?: () => Promise<Namespace | undefined>;
}

const STYLE_LABELS: Record<(typeof RESPONSE_STYLES)[number], string> = {
  default: 'Default',
  concise: 'Concise',
  explanatory: 'Explanatory',
  formal: 'Formal',
};
const LEVEL_LABELS: Record<(typeof TECHNICAL_LEVELS)[number], string> = {
  unspecified: 'No preference',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};
const FORMATTING_LABELS: Record<(typeof PREFERRED_FORMATTINGS)[number], string> = {
  unspecified: 'No preference',
  prose: 'Prose',
  bullets: 'Bullet lists',
  headings_and_bullets: 'Headings and bullet lists',
  tables_and_code: 'Tables and code blocks',
};
const LENGTH_LABELS: Record<(typeof PREFERRED_LENGTHS)[number], string> = {
  default: 'Default',
  shorter: 'Shorter',
  longer: 'Longer',
};
const TRAITS: readonly { key: string; label: string; less: string; more: string }[] = [
  { key: 'warmth', label: 'Warmth', less: 'Neutral and businesslike', more: 'Warm and personable' },
  { key: 'enthusiasm', label: 'Enthusiasm', less: 'Measured', more: 'Energetic and encouraging' },
  {
    key: 'headersLists',
    label: 'Headers and lists',
    less: 'Flowing prose',
    more: 'Headers and lists',
  },
  { key: 'emoji', label: 'Emoji', less: 'No emoji', more: 'Emoji welcome' },
];

async function chooseOne<T extends string>(
  title: string,
  current: T,
  options: readonly T[],
  labels: Record<T, string>,
  detail?: (value: T) => string | undefined,
): Promise<T | undefined> {
  const picked = await vscode.window.showQuickPick<ChoiceItem>(
    options.map((value) => {
      const text = detail?.(value);
      return {
        label: `${value === current ? '$(check) ' : ''}${labels[value]}`,
        value,
        ...(text === undefined ? {} : { detail: text }),
      };
    }),
    { title },
  );
  return picked?.value as T | undefined;
}

function traitSetting(trait: (typeof TRAITS)[number], value: number | undefined): string {
  if (value === undefined) return 'Default';
  return value <= 50 ? trait.less : trait.more;
}

function buildItems(namespace: Namespace, preference: ResponseStylePreference): SettingItem[] {
  const text = (key: string) =>
    typeof namespace[key] === 'string' ? (namespace[key] as string) : '';
  const editText = (key: string, prompt: string, maxLength: number) => async () => {
    const value = await vscode.window.showInputBox({
      prompt,
      value: text(key),
      ignoreFocusOut: true,
      validateInput: (input) =>
        input.trim().length > maxLength ? `Keep it under ${maxLength} characters.` : null,
    });
    return value === undefined ? undefined : { [key]: value.trim() };
  };
  return [
    { label: 'About you', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(person) What should AGI call you?',
      description: text('preferredName') || 'Not set',
      edit: editText('preferredName', 'What should AGI call you?', 60),
    },
    {
      label: '$(briefcase) What do you do?',
      description: text('workDescription') || 'Not set',
      edit: editText('workDescription', 'Your role or what you work on', 120),
    },
    { label: 'Responses', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(symbol-color) Style',
      description: STYLE_LABELS[preference.style],
      edit: async () => {
        const style = await chooseOne(
          'Response style',
          preference.style,
          RESPONSE_STYLES,
          STYLE_LABELS,
          (value) => (value === 'default' ? undefined : RESPONSE_STYLE_GUIDANCE[value]),
        );
        return style === undefined ? undefined : { style };
      },
    },
    {
      label: '$(mortar-board) Technical level',
      description: LEVEL_LABELS[preference.technicalLevel],
      edit: async () => {
        const technicalLevel = await chooseOne(
          'Technical level',
          preference.technicalLevel,
          TECHNICAL_LEVELS,
          LEVEL_LABELS,
        );
        return technicalLevel === undefined ? undefined : { technicalLevel };
      },
    },
    {
      label: '$(list-unordered) Formatting',
      description: FORMATTING_LABELS[preference.preferredFormatting],
      edit: async () => {
        const preferredFormatting = await chooseOne(
          'Formatting',
          preference.preferredFormatting,
          PREFERRED_FORMATTINGS,
          FORMATTING_LABELS,
        );
        return preferredFormatting === undefined ? undefined : { preferredFormatting };
      },
    },
    {
      label: '$(fold) Length',
      description: LENGTH_LABELS[preference.preferredLength],
      edit: async () => {
        const preferredLength = await chooseOne(
          'Length',
          preference.preferredLength,
          PREFERRED_LENGTHS,
          LENGTH_LABELS,
        );
        return preferredLength === undefined ? undefined : { preferredLength };
      },
    },
    {
      label: '$(globe) Language',
      description:
        preference.responseLanguage === RESPONSE_LANGUAGE_AUTO
          ? 'The language you write in'
          : preference.responseLanguage,
      edit: async () => {
        const value = await vscode.window.showInputBox({
          prompt:
            'A language tag such as en, de or pt-BR. Leave empty to answer in the language you write in.',
          value:
            preference.responseLanguage === RESPONSE_LANGUAGE_AUTO
              ? ''
              : preference.responseLanguage,
          ignoreFocusOut: true,
        });
        if (value === undefined) return undefined;
        return { responseLanguage: value.trim() === '' ? RESPONSE_LANGUAGE_AUTO : value.trim() };
      },
    },
    { label: 'Tone', kind: vscode.QuickPickItemKind.Separator },
    ...TRAITS.map((trait): SettingItem => ({
      label: `$(settings) ${trait.label}`,
      description: traitSetting(trait, preference.traits[trait.key]),
      edit: async () => {
        const picked = await vscode.window.showQuickPick<ChoiceItem>(
          [
            { label: 'Default', value: null },
            { label: trait.less, value: TRAIT_LOW },
            { label: trait.more, value: TRAIT_HIGH },
          ],
          { title: trait.label },
        );
        return picked === undefined ? undefined : { [trait.key]: picked.value };
      },
    })),
  ];
}

export async function managePersonalization(secrets: vscode.SecretStorage): Promise<void> {
  for (;;) {
    let namespace: Namespace | undefined;
    try {
      namespace = await readAccountPreferences(secrets, PERSONALIZATION_NAMESPACE);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: personalization could not be loaded, ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
    if (namespace === undefined) {
      const choice = await vscode.window.showWarningMessage(
        'AGI Workforce: sign in to AGI Cloud to change how AGI answers you.',
        'Sign in',
      );
      if (choice === 'Sign in') await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      buildItems(namespace, normalizeResponseStylePreference(namespace)),
      {
        title: 'AGI Workforce, Personalization',
        placeHolder: 'Applies to AGI Cloud answers on every device',
      },
    );
    if (picked?.edit === undefined) return;
    const patch = await picked.edit();
    if (patch === undefined) continue;
    try {
      await patchAccountPreferences(secrets, PERSONALIZATION_NAMESPACE, patch);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: that change was not saved, ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
  }
}
