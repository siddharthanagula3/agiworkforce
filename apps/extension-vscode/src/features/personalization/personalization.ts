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
const IDENTITY_NAMESPACE = 'general';
const TRAIT_LOW = 0;
const TRAIT_HIGH = 100;

type Namespace = PreferenceNamespace;

interface ChoiceItem extends vscode.QuickPickItem {
  value: unknown;
}

interface PreferenceEdit {
  namespace: string;
  patch: Namespace;
}

interface SettingItem extends vscode.QuickPickItem {
  edit?: () => Promise<PreferenceEdit | undefined>;
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

function stringField(source: Namespace, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function personalizationEdit(patch: Namespace): PreferenceEdit {
  return { namespace: PERSONALIZATION_NAMESPACE, patch };
}

function buildItems(
  identity: Namespace,
  namespace: Namespace,
  preference: ResponseStylePreference,
): SettingItem[] {
  const identityText = (key: string, legacyKey: string) =>
    stringField(identity, key) || stringField(namespace, legacyKey);
  const editIdentity =
    (key: string, legacyKey: string, prompt: string, maxLength: number) => async () => {
      const value = await vscode.window.showInputBox({
        prompt,
        value: identityText(key, legacyKey),
        ignoreFocusOut: true,
        validateInput: (input) =>
          input.trim().length > maxLength ? `Keep it under ${maxLength} characters.` : null,
      });
      return value === undefined
        ? undefined
        : { namespace: IDENTITY_NAMESPACE, patch: { [key]: value.trim() } };
    };
  return [
    { label: 'About you', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(person) What should AGI call you?',
      description: identityText('preferredName', 'nickname') || 'Not set',
      edit: editIdentity('preferredName', 'nickname', 'What should AGI call you?', 60),
    },
    {
      label: '$(briefcase) What do you do?',
      description: identityText('workDescription', 'occupation') || 'Not set',
      edit: editIdentity('workDescription', 'occupation', 'Your role or what you work on', 120),
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
        return style === undefined ? undefined : personalizationEdit({ style });
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
        return technicalLevel === undefined ? undefined : personalizationEdit({ technicalLevel });
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
        return preferredFormatting === undefined
          ? undefined
          : personalizationEdit({ preferredFormatting });
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
        return preferredLength === undefined ? undefined : personalizationEdit({ preferredLength });
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
        return personalizationEdit({
          responseLanguage: value.trim() === '' ? RESPONSE_LANGUAGE_AUTO : value.trim(),
        });
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
        return picked === undefined
          ? undefined
          : personalizationEdit({ [trait.key]: picked.value });
      },
    })),
  ];
}

export async function managePersonalization(secrets: vscode.SecretStorage): Promise<void> {
  for (;;) {
    let identity: Namespace | undefined;
    let namespace: Namespace | undefined;
    try {
      [identity, namespace] = await Promise.all([
        readAccountPreferences(secrets, IDENTITY_NAMESPACE),
        readAccountPreferences(secrets, PERSONALIZATION_NAMESPACE),
      ]);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: personalization could not be loaded, ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
    if (identity === undefined || namespace === undefined) {
      const choice = await vscode.window.showWarningMessage(
        'AGI Workforce: sign in to AGI Cloud to change how AGI answers you.',
        'Sign in',
      );
      if (choice === 'Sign in') await vscode.commands.executeCommand('agi-workforce.signIn');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      buildItems(identity, namespace, normalizeResponseStylePreference(namespace)),
      {
        title: 'AGI Workforce, Personalization',
        placeHolder: 'Applies to AGI Cloud answers on every device',
      },
    );
    if (picked?.edit === undefined) return;
    const edit = await picked.edit();
    if (edit === undefined) continue;
    try {
      await patchAccountPreferences(secrets, edit.namespace, edit.patch);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `AGI Workforce: that change was not saved, ${error instanceof Error ? error.message : String(error)}.`,
      );
      return;
    }
  }
}
