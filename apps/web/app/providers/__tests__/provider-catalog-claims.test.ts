import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ProviderGrid,
  type ProviderTile,
} from '@/features/marketing/components/system/ProviderGrid';

const appDir = join(__dirname, '..', '..');
const read = (relative: string) => readFileSync(join(appDir, relative), 'utf8');
const cliDir = join(appDir, '..', '..', 'cli', 'src');
const readCli = (relative: string) => readFileSync(join(cliDir, relative), 'utf8');
const sample = (source: string) => source.replace(/\\n/gu, ' ').replace(/\s+/gu, ' ');

function privacyModeText(method: 'label' | 'description', mode: string): string {
  const body = new RegExp(
    `pub fn ${method}\\(self\\) -> &'static str \\{([\\s\\S]*?)\\n    \\}`,
    'u',
  ).exec(readCli('platform/runtime/session.rs'));
  if (!body) throw new Error(`PrivacyMode::${method} not found in session.rs`);
  const arm = new RegExp(`Self::${mode} => \\{?\\s*"([^"]+)"`, 'u').exec(body[1]!);
  if (!arm) throw new Error(`PrivacyMode::${method} has no ${mode} arm`);
  return arm[1]!;
}

describe('provider catalog claims', () => {
  it.each(['byok/page.tsx', 'providers/page.tsx'])(
    '%s makes no per-token price promise',
    (relative) => {
      const source = read(relative);
      expect(source).not.toMatch(/per[- ]million/i);
      expect(source).not.toContain('moving a price');
    },
  );

  it('prints no currency amount and labels billing on every tile', () => {
    const tiles: ProviderTile[] = [
      {
        id: 'cloud',
        label: 'Cloud',
        defaultModel: 'cloud-default',
        modelCount: 3,
        billing: 'Billed by provider',
        kind: 'cloud',
      },
      {
        id: 'gateway',
        label: 'Gateway',
        defaultModel: 'gateway-default',
        modelCount: 1,
        billing: 'Billed by provider',
        kind: 'gateway',
      },
      {
        id: 'local',
        label: 'Local',
        defaultModel: '',
        modelCount: 0,
        billing: 'No key, no meter',
        kind: 'local',
      },
    ];
    const { container } = render(createElement(ProviderGrid, { tiles, label: 'Providers' }));
    expect(container.textContent).not.toMatch(/[$€£]\s?\d/);
    expect(screen.getAllByText('Billed by provider')).toHaveLength(2);
    expect(screen.queryByText('Provider rates')).toBeNull();
  });

  it('integrations hero primary action opens the public connector directory', () => {
    const source = read('integrations/page.tsx');
    const primary = source.match(/\{\s*href: '([^']+)'[^}]*variant: 'primary'/);
    expect(primary?.[1]).toBe('/connectors/mcp-directory');
  });
});

describe('terminal samples are the lines the CLI prints', () => {
  const providers = sample(read('providers/page.tsx'));
  const local = sample(read('local/page.tsx'));

  it('shows the models scan report the way format_probe_report writes it', () => {
    const report = readCli('local_models.rs');
    expect(report).toContain('String::from("Local model servers\\n")');
    expect(report).toContain('"\\n{}  {}  {}\\n"');
    expect(report).toContain('"  models:\\n"');
    expect(report).toContain('"    - {}\\n"');
    expect(report).toContain('const OLLAMA_DEFAULT_BASE_URL: &str = "http://localhost:11434";');

    for (const page of [read('providers/page.tsx'), read('local/page.tsx')]) {
      expect(page).toContain('Local model servers');
      expect(page).toContain('ollama  running  http://localhost:11434');
      expect(page).toContain('  models:');
      expect(page).toContain('    - <model>');
      expect(page).not.toMatch(/· 1 model/u);
    }
    expect(local).toContain('agi models scan');
  });

  it('shows the model swap notice the way /model writes it', () => {
    expect(readCli('repl/slash_commands.rs')).toContain('"Switched to {} ({})"');
    expect(readCli('tui/tui_app.rs')).toContain('"Switched to {} ({})"');
    expect(providers).toContain('Switched to <model> (<provider>)');
    expect(providers).not.toContain('Same thread, same authority');
  });

  it('shows the blocked send with the message validate_privacy_boundary raises', () => {
    const template =
      /"(Privacy boundary blocked: this session is Local, but model [^"]+ before anything leaves Local mode\.)"/u.exec(
        readCli('agent/mod.rs'),
      );
    expect(template, 'the Local boundary message moved').not.toBeNull();

    const values = [
      '<model>',
      '<Provider>',
      privacyModeText('description', 'Byok'),
      privacyModeText('label', 'Byok'),
      '/continue-with-byok',
    ];
    const printed = template![1]!.replace(/\{(?::\?)?\}/gu, () => values.shift() ?? '');

    expect(values).toEqual([]);
    expect(readCli('agent/mod.rs')).toContain('PrivacyMode::Byok => "/continue-with-byok"');
    expect(providers).toContain(printed);
    expect(providers).not.toMatch(/Refused: this session's authority is local/u);
  });

  it('describes a Local session as switching model and stopping at the next send', () => {
    const switchModel =
      /pub fn switch_model\(&mut self, model: &str\) -> Result<\(\)> \{([\s\S]*?)\n {4}\}\n/u.exec(
        readCli('agent/mod.rs'),
      );
    expect(switchModel, 'switch_model moved').not.toBeNull();
    expect(switchModel![1]).toContain(
      'if self.privacy_mode != PrivacyMode::Local && next_provider_mode != self.privacy_mode {',
    );
    expect(switchModel![1]).toContain('start a new session instead of carrying its transcript');
    expect(providers).toContain(
      'naming a cloud model changes the model and the next send stops at the privacy boundary',
    );
    expect(providers).toContain('is refused, with a message to start a new session');
  });
});
