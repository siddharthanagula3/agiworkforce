import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useSettingsStore } from '@/stores/settingsStore';

function getStore() {
  return useSettingsStore.getState();
}

beforeEach(() => {
  useSettingsStore.setState({ customCommands: [] });
});

describe('customCommands store', () => {
  it('adds a command with a generated id', () => {
    act(() => {
      getStore().addCustomCommand({
        name: 'summarize',
        description: 'Summarize',
        template: '{input}',
      });
    });
    const cmd = getStore().customCommands[0];
    expect(cmd!.name).toBe('summarize');
    expect(cmd!.id).toMatch(/^custom-/);
  });

  it('updates a command by id', () => {
    act(() => {
      getStore().addCustomCommand({ name: 'old', description: '', template: 'old' });
    });
    const id = getStore().customCommands[0]!.id;
    act(() => {
      getStore().updateCustomCommand(id, { name: 'new' });
    });
    expect(getStore().customCommands[0]!.name).toBe('new');
  });

  it('deletes a command by id', () => {
    act(() => {
      getStore().addCustomCommand({ name: 'del', description: '', template: 'x' });
    });
    const id = getStore().customCommands[0]!.id;
    act(() => {
      getStore().deleteCustomCommand(id);
    });
    expect(getStore().customCommands).toHaveLength(0);
  });
});

const NAME_RE = /^[a-z0-9-]{2,32}$/;

describe('command name validation rule', () => {
  it('accepts valid slugs', () => {
    expect(NAME_RE.test('summarize')).toBe(true);
    expect(NAME_RE.test('my-cmd')).toBe(true);
  });

  it('rejects spaces, uppercase, underscore, and short/long names', () => {
    expect(NAME_RE.test('My Cmd')).toBe(false);
    expect(NAME_RE.test('a')).toBe(false);
    expect(NAME_RE.test('a'.repeat(33))).toBe(false);
    expect(NAME_RE.test('my_cmd')).toBe(false);
  });
});

describe('template expansion', () => {
  function expand(template: string, input: string) {
    return template.replace(/\{input\}/g, input);
  }

  it('substitutes {input}', () => {
    expect(expand('Do: {input}', 'hello')).toBe('Do: hello');
  });

  it('handles no placeholder', () => {
    expect(expand('Fixed prompt', 'ignored')).toBe('Fixed prompt');
  });
});
