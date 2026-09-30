import ar from '../locales/ar/vscode.json' with { type: 'json' };
import de from '../locales/de/vscode.json' with { type: 'json' };
import en from '../locales/en/vscode.json' with { type: 'json' };
import es from '../locales/es/vscode.json' with { type: 'json' };
import fr from '../locales/fr/vscode.json' with { type: 'json' };
import hi from '../locales/hi/vscode.json' with { type: 'json' };
import it from '../locales/it/vscode.json' with { type: 'json' };
import ja from '../locales/ja/vscode.json' with { type: 'json' };
import ko from '../locales/ko/vscode.json' with { type: 'json' };
import pt from '../locales/pt/vscode.json' with { type: 'json' };
import ru from '../locales/ru/vscode.json' with { type: 'json' };
import zh from '../locales/zh/vscode.json' with { type: 'json' };

export type VsCodeMessageKey = keyof typeof en;

export const VSCODE_CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ar,
  de,
  en,
  es,
  fr,
  hi,
  it,
  ja,
  ko,
  pt,
  ru,
  zh,
};
